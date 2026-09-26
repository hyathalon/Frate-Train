import { type AthleteRow, type Caller, resolveAthlete } from './auth.ts';
import { LEVEL_NAME, loadCandidates, loadRaceOption, type RaceOption } from './candidates.ts';
import type { CallClaude, ClaudeCallResult } from './claude.ts';
import type { Anthropic, SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';
import { allowanceFor, appAllowance, assertCanConfirm, assertCanPreview, coachAllowance } from './limits.ts';
import { blockPrompt, type CoachProfile, outlinePrompt, type ProgramInputs, repairPrompt, systemPrompt } from './prompts.ts';
import { type Block, BLOCK_SCHEMA, type BlockWeek, DAYS, type Outline, OUTLINE_SCHEMA, type OutlineWeek } from './schemas.ts';
import { type CallType, costUsd, loadSettings, type ModelChoice, modelFor, type Settings, setting } from './settings.ts';
import { dayStart, daysBetween, isValidDate, localDate, nextMonday, planWindow } from './time.ts';
import { type BlockSettings, type Timing, timingKey, validateBlock, validateOutline } from './validate.ts';

export interface Deps {
  admin: SupabaseClient;
  callClaude: CallClaude | null; // null when ANTHROPIC_API_KEY isn't configured
  now: () => Date;
  runInBackground: (work: Promise<unknown>) => void;
}

const MAX_WEEKS = 16;
const MIN_WEEKS = 4;
const BLOCK_WEEKS = 4;
const SPEND_TIMEZONE = 'Australia/Sydney';
// The preview answers synchronously and must respond within the 150 s request limit.
const PREVIEW_TIMEOUT_MS = 90_000;
// A block call plus one repair must fit the 400 s Edge Function limit. High effort
// gets more time; its repair runs at medium.
const BLOCK_TIMEOUT_MS = { high: 210_000, other: 150_000 };
const REPAIR_TIMEOUT_MS = 150_000;
const STALE_GENERATION_MS = 7 * 60_000;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function stringList(value: unknown, field: string, max = 10): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string') || value.length > max) {
    throw new HttpError(400, 'invalid_input', `${field} must be a list of up to ${max} short texts.`);
  }
  return value.map((v: string) => v.trim().slice(0, 60)).filter(Boolean);
}

export function parseInputs(raw: unknown): ProgramInputs {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!isValidDate(body.race_date)) {
    throw new HttpError(400, 'invalid_input', 'Choose your race date.');
  }
  const raceOption = typeof body.race_option_id === 'string' && body.race_option_id ? body.race_option_id : 'hyrox-open';

  const days = body.training_days;
  if (!Array.isArray(days) || days.length < 1 || days.length > 7 || days.some((d) => !(DAYS as readonly unknown[]).includes(d))
      || new Set(days).size !== days.length) {
    throw new HttpError(400, 'invalid_input', 'Choose the days you can train (Mon to Sun, each once).');
  }
  const trainingDays = DAYS.filter((d) => days.includes(d)) as string[];
  if (typeof body.key_session_day !== 'string' || !trainingDays.includes(body.key_session_day)) {
    throw new HttpError(400, 'invalid_input', 'Choose which of your training days suits your key session.');
  }
  const minutes = Number(body.minutes_per_session);
  if (!Number.isInteger(minutes) || minutes < 20 || minutes > 90) {
    throw new HttpError(400, 'invalid_input', 'Choose how long each session can be (20 to 90 minutes).');
  }
  let longestRun: number | null = null;
  if (body.longest_run_min !== undefined && body.longest_run_min !== null) {
    longestRun = Number(body.longest_run_min);
    if (!Number.isInteger(longestRun) || longestRun < 0 || longestRun > 300) {
      throw new HttpError(400, 'invalid_input', 'Your longest run in the last 3 weeks must be 0 to 300 minutes.');
    }
  }
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 200) : '';
  if (!goal) throw new HttpError(400, 'invalid_input', 'Describe your race goal.');
  const raceName = typeof body.race_name === 'string' && body.race_name.trim() ? body.race_name.trim().slice(0, 80) : null;
  return {
    race_option_id: raceOption,
    race_name: raceName,
    race_date: body.race_date,
    training_days: trainingDays,
    key_session_day: body.key_session_day,
    minutes_per_session: minutes,
    goal,
    strengths: stringList(body.strengths, 'Strengths'),
    weaknesses: stringList(body.weaknesses, 'Weaknesses'),
    longest_run_min: longestRun,
    cross_training_preferences: stringList(body.cross_training_preferences, 'Cross-training preferences', 8),
  };
}

/** Cross-training preferences must use the exercise library's equipment names. */
async function checkCrossTraining(admin: SupabaseClient, preferences: string[] | undefined) {
  if (!preferences?.length) return;
  const { data, error } = await admin.from('exercises').select('equipment_options');
  if (error) throw new Error(`Could not read the exercise library: ${error.message}`);
  const known = new Set(data.flatMap((row) => (row.equipment_options ?? []).flat()));
  const unknown = preferences.filter((p) => !known.has(p));
  if (unknown.length) {
    throw new HttpError(400, 'invalid_input', `Unknown cross-training option(s): ${unknown.join(', ')}.`);
  }
}

async function requireRaceOption(admin: SupabaseClient, id: string): Promise<RaceOption> {
  const race = await loadRaceOption(admin, id);
  if (!race) throw new HttpError(400, 'invalid_input', 'Choose your race type.');
  return race;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function readReferenceText(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('hyathlon_reference')
    .select('filename, content')
    .or('filename.ilike.%Hyathlon_System_Booklet%,filename.ilike.%Coaching_Handbook%')
    .order('filename');
  if (error || !data?.length) {
    console.warn(`[generate-program] Reference material unavailable: ${error?.message ?? 'no rows'}`);
    return '';
  }
  return data.map((row) => `--- ${row.filename} ---\n${row.content}`).join('\n\n');
}

async function loadCoachProfile(admin: SupabaseClient, athleteId: string): Promise<CoachProfile | null> {
  const { data, error } = await admin
    .from('athlete_coach_profiles')
    .select('strengths, weaknesses, priority_pillars, limiters, coach_notes')
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the coach profile: ${error.message}`);
  return data as CoachProfile | null;
}

interface EventBase {
  userId: string;
  athleteId: string;
  programId: string;
  blockNo: number | null;
  callType: CallType;
}

async function recordEvent(
  admin: SupabaseClient,
  base: EventBase,
  model: ModelChoice,
  result: ClaudeCallResult<unknown>,
  extra: { ok: boolean; isRepair: boolean; countsAs: string | null; paidWith: string | null; error: string | null },
) {
  const { error } = await admin.from('generation_events').insert({
    user_id: base.userId,
    athlete_id: base.athleteId,
    program_id: base.programId,
    block_no: base.blockNo,
    call_type: base.callType,
    is_repair: extra.isRepair,
    counts_as: extra.ok ? extra.countsAs : null,
    paid_with: extra.ok ? extra.paidWith : null,
    model: model.model,
    status: extra.ok ? 'ok' : 'failed',
    ...result.usage,
    cost_usd: costUsd(result.usage, model),
    duration_ms: result.durationMs,
    error: extra.error?.slice(0, 2000) ?? null,
  });
  if (error) console.error(`[generate-program] Could not record usage: ${error.message}`);
}

/** Alerts the coach once per Sydney day when Anthropic spend passes the threshold. */
async function checkSpendAlert(deps: Deps, settings: Settings) {
  const now = deps.now();
  const since = dayStart(now, SPEND_TIMEZONE).toISOString();
  const { data, error } = await deps.admin.from('generation_events').select('cost_usd').gte('created_at', since);
  if (error) return console.error(`[generate-program] Spend check failed: ${error.message}`);
  const spent = data.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  const threshold = setting(settings, 'daily_spend_alert_usd');
  if (spent < threshold) return;
  const { error: insertError } = await deps.admin.from('coach_alerts').insert({
    kind: 'spend',
    alert_date: localDate(now, SPEND_TIMEZONE),
    message: `Anthropic spend today has passed $${threshold.toFixed(2)} (now $${spent.toFixed(2)}).`,
    details: { spent_usd: Math.round(spent * 100) / 100, threshold_usd: threshold },
  });
  // 23505: today's alert already exists.
  if (insertError && insertError.code !== '23505') console.error(`[generate-program] Spend alert failed: ${insertError.message}`);
}

/** One call, plus one automatic repair when validation fails. Records every call. */
async function generateWithRepair<T>(args: {
  deps: Deps;
  settings: Settings;
  event: EventBase;
  model: ModelChoice;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  validate: (data: T) => string[] | Promise<string[]>;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high' | null;
  timeoutMs: number;
  repairTimeoutMs?: number;
  countsAs: string | null;
  paidWith: string | null;
}): Promise<{ data: T | null; error: string | null }> {
  const { deps, event, model } = args;
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: args.prompt }];
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await deps.callClaude!<T>({
      model,
      system: args.system,
      messages,
      schema: args.schema,
      maxTokens: args.maxTokens,
      // A repair after a high-effort call runs at medium to stay inside the time limit.
      effort: (attempt > 0 && args.effort === 'high' ? 'medium' : args.effort) ?? undefined,
      timeoutMs: attempt > 0 ? args.repairTimeoutMs ?? args.timeoutMs : args.timeoutMs,
    });
    const errors = result.data ? await args.validate(result.data) : [];
    const ok = result.data !== null && errors.length === 0;
    lastError = result.error ?? (errors.length ? `Failed checks: ${errors.slice(0, 5).join(' ')}` : null);
    await recordEvent(deps.admin, event, model, result, {
      ok,
      isRepair: attempt > 0,
      countsAs: args.countsAs,
      paidWith: args.paidWith,
      error: ok ? null : lastError,
    });
    await checkSpendAlert(deps, args.settings);
    if (ok) return { data: result.data, error: null };
    // Only a valid-but-rule-breaking answer is worth a repair turn.
    if (!result.data || errors.length === 0) break;
    messages.push({ role: 'assistant', content: result.text }, { role: 'user', content: repairPrompt(errors) });
  }
  return { data: null, error: lastError };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function buildsStatus(deps: Deps, caller: Caller, body: Record<string, unknown>) {
  const settings = await loadSettings(deps.admin);
  if (caller.role === 'coach') {
    return { allowance: await coachAllowance(deps.admin, caller.userId, settings, deps.now()) };
  }
  const athlete = await resolveAthlete(deps.admin, caller, body.athlete_id, { forBuilding: false });
  if (athlete.tier === 'member') return { allowance: { kind: 'member' } };
  return { allowance: await appAllowance(deps.admin, athlete, settings, deps.now()) };
}

/** Outline only (Haiku), as a preview. Uses one preview for app-tier athletes. */
export async function preview(deps: Deps, caller: Caller, body: Record<string, unknown>) {
  const { admin } = deps;
  const settings = await loadSettings(admin);
  const athlete = await resolveAthlete(admin, caller, body.athlete_id, { forBuilding: true });
  const inputs = parseInputs(body.inputs);
  const race = await requireRaceOption(admin, inputs.race_option_id);
  await checkCrossTraining(admin, inputs.cross_training_preferences);

  const today = localDate(deps.now(), athlete.timezone);
  let startDate = nextMonday(today);
  if (body.start_date !== undefined && body.start_date !== null) {
    if (!isValidDate(body.start_date) || body.start_date < today) {
      throw new HttpError(400, 'invalid_input', 'The start date must be today or later.');
    }
    startDate = body.start_date;
  }
  if (inputs.race_date <= startDate) {
    throw new HttpError(400, 'race_too_soon', 'Your race must be after the program starts.');
  }
  const window = planWindow(startDate, inputs.race_date, MAX_WEEKS);
  if (window.totalWeeks < MIN_WEEKS) {
    throw new HttpError(400, 'race_too_soon',
      `Programs need at least ${MIN_WEEKS} weeks. With a start on ${window.startDate}, your race is only ${window.totalWeeks} week(s) away.`);
  }

  assertCanPreview(await allowanceFor(admin, caller, athlete, settings, deps.now()));
  if (!deps.callClaude) throw new HttpError(503, 'generation_unavailable', 'Program building is not available right now.');

  const coach = await loadCoachProfile(admin, athlete.id);
  const { data: program, error: insertError } = await admin
    .from('training_programs')
    .insert({
      athlete_id: athlete.id,
      created_by: caller.userId,
      status: 'preview',
      race_name: inputs.race_name,
      race_date: inputs.race_date,
      start_date: window.startDate,
      total_weeks: window.totalWeeks,
      inputs,
    })
    .select('id')
    .single();
  if (insertError) throw new Error(`Could not create the program: ${insertError.message}`);

  const model = await modelFor(admin, 'outline_preview');
  const result = await generateWithRepair<Outline>({
    deps,
    settings,
    event: { userId: caller.userId, athleteId: athlete.id, programId: program.id, blockNo: null, callType: 'outline_preview' },
    model,
    system: systemPrompt(await readReferenceText(admin)),
    prompt: outlinePrompt(athlete, inputs, coach, race, window),
    schema: OUTLINE_SCHEMA,
    validate: (o) => validateOutline(o, { totalWeeks: window.totalWeeks, daysAvailable: inputs.training_days.length }),
    maxTokens: 16000,
    timeoutMs: PREVIEW_TIMEOUT_MS,
    countsAs: 'preview',
    paidWith: caller.role === 'coach' ? null : 'monthly',
  });

  if (!result.data) {
    await admin.from('training_programs').update({ status: 'failed' }).eq('id', program.id);
    throw new HttpError(502, 'generation_failed', "We couldn't build the preview. Please try again; it didn't use a preview.",
      { program_id: program.id, retry: true });
  }

  await admin.from('training_programs').update({ outline: result.data, outline_version: 1 }).eq('id', program.id);
  await admin.from('program_outline_versions').insert({ program_id: program.id, version: 1, outline: result.data, reason: 'preview' });

  return {
    program: {
      id: program.id,
      status: 'preview',
      athlete_id: athlete.id,
      race_name: inputs.race_name,
      race_label: race.label,
      race_date: inputs.race_date,
      start_date: window.startDate,
      total_weeks: window.totalWeeks,
      outline: result.data,
    },
    allowance: await allowanceFor(admin, caller, athlete, settings, deps.now()),
  };
}

/**
 * Confirm a preview: generates block 1 (Sonnet) in the background and, when it
 * is ready, activates the program and archives the athlete's previous one.
 * Uses one confirmation (monthly first, then a purchased credit) on success.
 * Calling it again after a failure retries block 1 without using another.
 */
export async function confirm(deps: Deps, caller: Caller, body: Record<string, unknown>) {
  const { admin } = deps;
  const settings = await loadSettings(admin);
  if (typeof body.program_id !== 'string') throw new HttpError(400, 'invalid_input', 'program_id is required.');

  const { data: program, error } = await admin
    .from('training_programs')
    .select('id, athlete_id, status, total_weeks, outline, inputs')
    .eq('id', body.program_id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the program: ${error.message}`);
  if (!program) throw new HttpError(404, 'program_not_found', 'That program could not be found.');
  const athlete = await resolveAthlete(admin, caller, program.athlete_id, { forBuilding: true });

  const endWeek = Math.min(BLOCK_WEEKS, program.total_weeks);
  const blockResponse = (status: string) => ({ program_id: program.id, block_no: 1, weeks: [1, endWeek], status });

  if (program.status === 'active') {
    const { data: block } = await admin.from('program_blocks').select('status').eq('program_id', program.id).eq('block_no', 1).maybeSingle();
    return blockResponse(block?.status ?? 'ready');
  }
  if (program.status !== 'preview' || !program.outline) {
    throw new HttpError(409, 'not_a_preview', 'Only a finished preview can be confirmed.');
  }

  const paidWith = assertCanConfirm(await allowanceFor(admin, caller, athlete, settings, deps.now()));
  if (!deps.callClaude) throw new HttpError(503, 'generation_unavailable', 'Program building is not available right now.');

  // Cap attempts per block per day (repairs don't count as attempts).
  const since = new Date(deps.now().getTime() - 24 * 3600 * 1000).toISOString();
  const { count: attemptsToday } = await admin
    .from('generation_events')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', program.id)
    .eq('block_no', 1)
    .eq('is_repair', false)
    .gte('created_at', since);
  if ((attemptsToday ?? 0) >= setting(settings, 'block_attempts_per_day_max')) {
    throw new HttpError(429, 'block_attempts_used', 'This block has been retried too many times today. Please try again tomorrow.');
  }

  // Claim block 1 unless a generation is already running (and not stale).
  await admin
    .from('program_blocks')
    .upsert({ program_id: program.id, block_no: 1, start_week: 1, end_week: endWeek, status: 'pending' },
      { onConflict: 'program_id,block_no', ignoreDuplicates: true });
  const staleBefore = new Date(deps.now().getTime() - STALE_GENERATION_MS).toISOString();
  const { data: existing } = await admin
    .from('program_blocks').select('attempts').eq('program_id', program.id).eq('block_no', 1).single();
  const { data: claimed, error: claimError } = await admin
    .from('program_blocks')
    .update({ status: 'generating', started_at: deps.now().toISOString(), attempts: (existing?.attempts ?? 0) + 1, last_error: null })
    .eq('program_id', program.id)
    .eq('block_no', 1)
    .or(`status.in.(pending,failed),and(status.eq.generating,started_at.lt.${staleBefore})`)
    .select('id');
  if (claimError) throw new Error(`Could not start block 1: ${claimError.message}`);
  if (!claimed?.length) return blockResponse('generating');

  deps.runInBackground(
    generateFirstBlock(deps, settings, caller, athlete, program as ProgramRow, endWeek, paidWith).catch(async (err) => {
      console.error('[generate-program] Block 1 failed unexpectedly', err);
      await admin.from('program_blocks').update({ status: 'failed', last_error: 'Something went wrong. Please try again.' })
        .eq('program_id', program.id).eq('block_no', 1);
    }),
  );
  return blockResponse('generating');
}

interface ProgramRow {
  id: string;
  athlete_id: string;
  status: string;
  total_weeks: number;
  outline: Outline;
  inputs: ProgramInputs;
}

async function generateFirstBlock(
  deps: Deps,
  settings: Settings,
  caller: Caller,
  athlete: AthleteRow,
  program: ProgramRow,
  endWeek: number,
  paidWith: 'monthly' | 'credit' | null,
) {
  const { admin } = deps;
  const outline = program.outline;
  const inputs = program.inputs;
  const level = LEVEL_NAME[athlete.level];
  const blockWeeks = outline.weeks.filter((w) => w.week >= 1 && w.week <= endWeek);
  const { candidates, frame, tabataTimings, coach } = await prepareGeneration(admin, athlete, inputs, blockWeeks);
  const model = await modelFor(admin, 'confirmation_block');
  const effort = athlete.tier === 'member' ? model.effortMember : model.effortOther;

  const result = await generateWithRepair<Block>({
    deps,
    settings,
    event: { userId: caller.userId, athleteId: athlete.id, programId: program.id, blockNo: 1, callType: 'confirmation_block' },
    model,
    system: systemPrompt(await readReferenceText(admin)),
    prompt: blockPrompt({ athlete, inputs, coach, outline, startWeek: 1, endWeek, candidates, frame, tabataTimings }),
    schema: BLOCK_SCHEMA,
    validate: async (b) =>
      validateBlock(b, {
        startWeek: 1,
        endWeek,
        outlineWeeks: outline.weeks,
        trainingDays: inputs.training_days,
        keySessionDay: inputs.key_session_day,
        minutesPerSession: inputs.minutes_per_session,
        frame,
        candidates,
        timings: await partTimings(admin, b, level),
        settings: blockSettings(settings),
      }),
    maxTokens: 32000,
    effort,
    timeoutMs: effort === 'high' ? BLOCK_TIMEOUT_MS.high : BLOCK_TIMEOUT_MS.other,
    repairTimeoutMs: REPAIR_TIMEOUT_MS,
    countsAs: 'confirmation',
    paidWith,
  });

  if (!result.data) {
    await admin.from('program_blocks').update({
      status: 'failed',
      last_error: "We couldn't build these weeks. Please try again; it didn't use a confirmation.",
    }).eq('program_id', program.id).eq('block_no', 1);
    await admin.from('coach_alerts').insert({
      kind: 'generation_failed',
      alert_date: localDate(deps.now(), SPEND_TIMEZONE),
      athlete_id: athlete.id,
      program_id: program.id,
      message: `Block 1 failed to generate for ${athlete.name ?? 'an athlete'}.`,
      details: { error: result.error },
    });
    return;
  }

  const sessions = addTiming(result.data, await partTimings(admin, result.data, level), frame);

  // Activate: archive the athlete's current program first (one active per athlete).
  const now = deps.now().toISOString();
  await admin.from('training_programs').update({ status: 'archived', archived_at: now })
    .eq('athlete_id', athlete.id).eq('status', 'active').neq('id', program.id);
  const { error: activateError } = await admin.from('training_programs')
    .update({ status: 'active', confirmed_at: now }).eq('id', program.id);
  if (activateError) throw new Error(`Could not activate the program: ${activateError.message}`);
  await admin.from('program_blocks').update({
    status: 'ready',
    sessions,
    targets: { weeks: blockWeeks, minutes_per_session: inputs.minutes_per_session, frame },
    generated_at: now,
    last_error: null,
  }).eq('program_id', program.id).eq('block_no', 1);
  if (paidWith === 'credit') {
    await admin.from('athlete_credit_ledger').insert({
      athlete_id: athlete.id, kind: 'confirmation', delta: -1, reason: 'used', program_id: program.id,
    });
  }
}

/** Everything a block or week call needs besides the outline. */
async function prepareGeneration(admin: SupabaseClient, athlete: AthleteRow, inputs: ProgramInputs, weeks: OutlineWeek[]) {
  const level = LEVEL_NAME[athlete.level];
  const race = await requireRaceOption(admin, inputs.race_option_id);
  const [candidates, frame, tabataTimings, coach] = await Promise.all([
    loadCandidates(admin, athlete, race, { includeRaceSessions: weeks.some((w) => w.phase === 'specific' || w.phase === 'taper') }),
    sessionFrame(admin, inputs.minutes_per_session),
    Promise.all([1, 2, 3, 4].map((n) => planFormat(admin, 'Tabata', 4 * n + 2 * (n - 1), level))),
    loadCoachProfile(admin, athlete.id),
  ]);
  return { candidates, frame, tabataTimings, coach };
}

// ---------------------------------------------------------------------------
// Weekly check-in: energy, sleep and availability for the coming week.
// Regenerates that one week when something changed. Never uses a build.
// ---------------------------------------------------------------------------

const RATINGS = ['good', 'ok', 'poor'];

/** Week number (1-based) containing `date`, for a program starting on startDate. */
function weekOf(startDate: string, date: string): number {
  return Math.floor(daysBetween(startDate, date) / 7) + 1;
}

export async function weeklyCheckin(deps: Deps, caller: Caller, body: Record<string, unknown>) {
  const { admin } = deps;
  if (typeof body.program_id !== 'string') throw new HttpError(400, 'invalid_input', 'program_id is required.');
  const { data: program, error } = await admin
    .from('training_programs')
    .select('id, athlete_id, status, start_date, total_weeks, outline, inputs')
    .eq('id', body.program_id)
    .maybeSingle();
  if (error) throw new Error(`Could not load the program: ${error.message}`);
  if (!program) throw new HttpError(404, 'program_not_found', 'That program could not be found.');
  const athlete = await resolveAthlete(admin, caller, program.athlete_id, { forBuilding: false });
  if (program.status !== 'active') throw new HttpError(409, 'program_not_active', 'Check-ins are for your active program.');

  // The check-in is for the coming week.
  const today = localDate(deps.now(), athlete.timezone);
  const coming = today < program.start_date ? 1 : weekOf(program.start_date, today) + 1;
  if (body.week !== coming || coming > program.total_weeks) {
    throw new HttpError(400, 'wrong_week', coming > program.total_weeks
      ? 'Your program has no more weeks to check in for.'
      : `This check-in is for week ${coming}.`, { coming_week: coming });
  }
  if (!RATINGS.includes(body.energy as string) || !RATINGS.includes(body.sleep as string)) {
    throw new HttpError(400, 'invalid_input', 'Rate your energy and sleep: good, OK or poor.');
  }

  // Availability changes, validated with the same rules as Program Builder.
  const inputs = program.inputs as ProgramInputs;
  const raw = (body.availability ?? null) as Record<string, unknown> | null;
  let availability: { training_days: string[]; key_session_day: string; minutes_per_session: number; applies: string } | null = null;
  if (raw) {
    const merged = parseInputs({
      ...inputs,
      training_days: raw.training_days ?? inputs.training_days,
      key_session_day: raw.key_session_day ?? (Array.isArray(raw.training_days) && !raw.training_days.includes(inputs.key_session_day) ? null : inputs.key_session_day),
      minutes_per_session: raw.minutes_per_session ?? inputs.minutes_per_session,
    });
    if (raw.applies !== 'this_week' && raw.applies !== 'ongoing') {
      throw new HttpError(400, 'invalid_input', 'Say whether the change is for this week only or ongoing.');
    }
    const changed = merged.training_days.join() !== inputs.training_days.join()
      || merged.key_session_day !== inputs.key_session_day
      || merged.minutes_per_session !== inputs.minutes_per_session;
    if (changed) {
      availability = {
        training_days: merged.training_days,
        key_session_day: merged.key_session_day,
        minutes_per_session: merged.minutes_per_session,
        applies: raw.applies,
      };
    }
  }

  const reasons: string[] = [];
  if (availability) reasons.push('availability changed');
  if (body.energy === 'poor') reasons.push('low energy');
  if (body.sleep === 'poor') reasons.push('poor sleep');

  const { data: checkin, error: insertError } = await admin.from('weekly_checkins').insert({
    program_id: program.id, week: coming, submitted_by: caller.userId, energy: body.energy, sleep: body.sleep,
    availability, reasons, status: reasons.length ? 'saved' : 'unchanged',
  }).select('id').single();
  if (insertError?.code === '23505') throw new HttpError(409, 'already_checked_in', `You've already checked in for week ${coming}.`);
  if (insertError) throw new Error(`Could not save the check-in: ${insertError.message}`);

  if (availability?.applies === 'ongoing') {
    await admin.from('training_programs').update({
      inputs: { ...inputs, training_days: availability.training_days, key_session_day: availability.key_session_day, minutes_per_session: availability.minutes_per_session },
    }).eq('id', program.id);
  }
  if (!reasons.length) return { checkin_id: checkin.id, week: coming, status: 'unchanged' };

  const { data: block } = await admin.from('program_blocks')
    .select('id, block_no, start_week, end_week, status, sessions')
    .eq('program_id', program.id).lte('start_week', coming).gte('end_week', coming).maybeSingle();
  if (!block || block.status !== 'ready') {
    // The week isn't built yet: the next block will use the new availability.
    await admin.from('weekly_checkins').update({ status: 'unchanged' }).eq('id', checkin.id);
    return { checkin_id: checkin.id, week: coming, status: 'unchanged', note: 'This week will be built with your changes.' };
  }
  if (!deps.callClaude) throw new HttpError(503, 'generation_unavailable', 'Adjusting your week is not available right now.');

  await admin.from('weekly_checkins').update({ status: 'adjusting' }).eq('id', checkin.id);
  const weekInputs: ProgramInputs = availability ? { ...inputs, ...availability } : inputs;
  deps.runInBackground(
    adjustWeek(deps, caller, athlete, program as ProgramRow & { start_date: string }, block as BlockRow, coming, weekInputs, reasons, checkin.id)
      .catch(async (err) => {
        console.error('[generate-program] Week adjustment failed unexpectedly', err);
        await admin.from('weekly_checkins').update({ status: 'failed', last_error: 'Something went wrong. Your week is unchanged.' }).eq('id', checkin.id);
      }),
  );
  return { checkin_id: checkin.id, week: coming, status: 'adjusting', reasons };
}

interface BlockRow {
  id: string;
  block_no: number;
  start_week: number;
  end_week: number;
  status: string;
  sessions: Block;
}

async function adjustWeek(
  deps: Deps,
  caller: Caller,
  athlete: AthleteRow,
  program: ProgramRow,
  block: BlockRow,
  week: number,
  inputs: ProgramInputs,
  reasons: string[],
  checkinId: string,
) {
  const { admin } = deps;
  const settings = await loadSettings(admin);
  const level = LEVEL_NAME[athlete.level];
  const planned = program.outline.weeks.find((w) => w.week === week)!;
  const tired = reasons.includes('low energy') || reasons.includes('poor sleep');
  // Targets for this week: fewer core sessions if fewer days; a lighter (deload) week when tired.
  const target: OutlineWeek = {
    ...planned,
    core_sessions: Math.min(planned.core_sessions, inputs.training_days.length),
    ...(tired ? { deload: true, lever: 'deload' as const, load: 'Low' as const } : {}),
  };
  const index = block.sessions.weeks.findIndex((w) => w.week === week);
  const previousWeek: BlockWeek | undefined = index > 0 ? block.sessions.weeks[index - 1] : await lastWeekBefore(admin, program.id, block.block_no);
  const { candidates, frame, tabataTimings, coach } = await prepareGeneration(admin, athlete, inputs, [target]);
  const model = await modelFor(admin, 'week_adjust');
  const effort = athlete.tier === 'member' ? model.effortMember : model.effortOther;

  const adjustment = [
    `Rewrite week ${week} only, because: ${reasons.join(', ')}.`,
    reasons.includes('availability changed')
      ? `The athlete now trains on ${inputs.training_days.join(', ')} for ${inputs.minutes_per_session} min, key session on ${inputs.key_session_day}.`
      : '',
    tired
      ? 'Make it a lighter week (about 60–70% of the previous week): keep the key session at maintain effort, no "go to the well" sessions, and use the fatigue rules.'
      : 'Keep the week\'s purpose and progression from the outline.',
  ].filter(Boolean).join('\n');

  const result = await generateWithRepair<Block>({
    deps,
    settings,
    event: { userId: caller.userId, athleteId: athlete.id, programId: program.id, blockNo: block.block_no, callType: 'week_adjust' },
    model,
    system: systemPrompt(await readReferenceText(admin)),
    prompt: blockPrompt({
      athlete, inputs, coach, outline: program.outline, startWeek: week, endWeek: week, candidates, frame, tabataTimings,
      targetWeeks: [target], previousWeek, adjustment,
    }),
    schema: BLOCK_SCHEMA,
    validate: async (b) =>
      validateBlock(b, {
        startWeek: week,
        endWeek: week,
        outlineWeeks: [target],
        trainingDays: inputs.training_days,
        keySessionDay: inputs.key_session_day,
        minutesPerSession: inputs.minutes_per_session,
        frame,
        candidates,
        timings: await partTimings(admin, b, level),
        settings: blockSettings(settings),
        previousWeek,
      }),
    maxTokens: 16000,
    effort,
    timeoutMs: effort === 'high' ? BLOCK_TIMEOUT_MS.high : BLOCK_TIMEOUT_MS.other,
    repairTimeoutMs: REPAIR_TIMEOUT_MS,
    countsAs: null,
    paidWith: null,
  });

  if (!result.data) {
    await admin.from('weekly_checkins').update({ status: 'failed', last_error: "We couldn't adjust this week. Your planned week is unchanged." }).eq('id', checkinId);
    return;
  }
  const adjusted = addTiming(result.data, await partTimings(admin, result.data, level), frame).weeks[0];
  const sessions: Block = { ...block.sessions, weeks: block.sessions.weeks.map((w) => (w.week === week ? adjusted : w)) };
  await admin.from('program_blocks').update({ sessions }).eq('id', block.id);
  await admin.from('weekly_checkins').update({ status: 'adjusted', previous_week: block.sessions.weeks[index] ?? null }).eq('id', checkinId);
}

/** The last week of the previous block, if there is one. */
async function lastWeekBefore(admin: SupabaseClient, programId: string, blockNo: number): Promise<BlockWeek | undefined> {
  if (blockNo <= 1) return undefined;
  const { data } = await admin.from('program_blocks').select('sessions').eq('program_id', programId).eq('block_no', blockNo - 1).maybeSingle();
  const weeks = (data?.sessions as Block | undefined)?.weeks;
  return weeks?.[weeks.length - 1];
}

// ---------------------------------------------------------------------------
// Timing: always from the database (plan_format / plan_session_frame).
// ---------------------------------------------------------------------------

function blockSettings(settings: Settings): BlockSettings {
  return {
    minutesTolerance: setting(settings, 'session_minutes_tolerance'),
    deloadMin: setting(settings, 'deload_volume_min'),
    deloadMax: setting(settings, 'deload_volume_max'),
    deloadSessionMinRatio: setting(settings, 'deload_session_minutes_min_ratio'),
    runShareMax: setting(settings, 'compromised_run_share_max'),
  };
}

async function sessionFrame(admin: SupabaseClient, minutes: number) {
  const { data, error } = await admin.rpc('plan_session_frame', { p_minutes: minutes });
  if (error) throw new Error(`plan_session_frame failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { warmup_min: Number(row.warmup_min), cooldown_min: Number(row.cooldown_min) };
}

async function planFormat(admin: SupabaseClient, format: string, minutes: number, level: string): Promise<Timing> {
  const { data, error } = await admin.rpc('plan_format', { p_format: format, p_minutes: Math.round(minutes), p_level: level });
  if (error) throw new Error(`plan_format failed: ${error.message}`);
  return data as Timing;
}

/** plan_format() for every distinct format and length in the block. */
async function partTimings(admin: SupabaseClient, block: Block, level: string): Promise<Map<string, Timing>> {
  const keys = new Map<string, { format: string; minutes: number }>();
  for (const week of block.weeks) {
    for (const session of week.sessions) {
      for (const part of session.parts) keys.set(timingKey(part.format, part.minutes), { format: part.format, minutes: part.minutes });
    }
  }
  const entries = await Promise.all(
    [...keys.entries()].map(async ([key, { format, minutes }]) => {
      try {
        return [key, await planFormat(admin, format, minutes, level)] as const;
      } catch {
        return null; // unknown format: the validator reports it
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, Timing] => e !== null));
}

/** Attaches each part's timing and each session's warm-up / cool-down. */
function addTiming(block: Block, timings: Map<string, Timing>, frame: { warmup_min: number; cooldown_min: number }): Block {
  for (const week of block.weeks) {
    for (const session of week.sessions) {
      for (const part of session.parts) part.timing = timings.get(timingKey(part.format, part.minutes));
      session.frame = {
        ...frame,
        total_min: frame.warmup_min + frame.cooldown_min + session.parts.reduce((m, p) => m + p.minutes, 0),
      };
    }
  }
  return block;
}
