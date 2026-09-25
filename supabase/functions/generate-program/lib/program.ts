import { type AthleteRow, type Caller, resolveAthlete } from './auth.ts';
import { loadCandidates } from './candidates.ts';
import type { CallClaude, ClaudeCallResult } from './claude.ts';
import type { Anthropic, SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';
import { allowanceFor, appAllowance, assertCanConfirm, assertCanPreview, coachAllowance } from './limits.ts';
import { blockPrompt, type CoachProfile, outlinePrompt, type ProgramInputs, repairPrompt, systemPrompt } from './prompts.ts';
import { type Block, BLOCK_SCHEMA, type Outline, OUTLINE_SCHEMA } from './schemas.ts';
import { type CallType, costUsd, loadSettings, type ModelChoice, modelFor, type Settings, setting } from './settings.ts';
import { dayStart, isValidDate, localDate, nextMonday, planWindow } from './time.ts';
import { validateBlock, validateOutline } from './validate.ts';

export interface Deps {
  admin: SupabaseClient;
  callClaude: CallClaude | null; // null when ANTHROPIC_API_KEY isn't configured
  now: () => Date;
  runInBackground: (work: Promise<unknown>) => void;
  blockEffort: 'low' | 'medium' | 'high';
}

const MAX_WEEKS = 16;
const MIN_WEEKS = 4;
const BLOCK_WEEKS = 4;
const SPEND_TIMEZONE = 'Australia/Sydney';
// The preview answers synchronously and must respond within the 150 s request limit.
const PREVIEW_TIMEOUT_MS = 90_000;
// Two block calls (first try + one repair) must fit the 400 s Edge Function limit.
const BLOCK_TIMEOUT_MS = 170_000;
const STALE_GENERATION_MS = 7 * 60_000;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string') || value.length > 10) {
    throw new HttpError(400, 'invalid_input', `${field} must be a list of up to 10 short texts.`);
  }
  return value.map((v: string) => v.trim().slice(0, 60)).filter(Boolean);
}

export function parseInputs(raw: unknown): ProgramInputs {
  const body = (raw ?? {}) as Record<string, unknown>;
  if (!isValidDate(body.race_date)) {
    throw new HttpError(400, 'invalid_input', 'Choose your race date.');
  }
  const days = Number(body.days_available);
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    throw new HttpError(400, 'invalid_input', 'Choose how many days a week you can train (1 to 7).');
  }
  let hours: number | null = null;
  if (body.weekly_hours !== undefined && body.weekly_hours !== null) {
    hours = Number(body.weekly_hours);
    if (!Number.isFinite(hours) || hours < 1 || hours > 30) {
      throw new HttpError(400, 'invalid_input', 'Weekly training hours must be between 1 and 30.');
    }
  }
  const goal = typeof body.goal === 'string' ? body.goal.trim().slice(0, 200) : '';
  if (!goal) throw new HttpError(400, 'invalid_input', 'Describe your race goal.');
  const raceName = typeof body.race_name === 'string' && body.race_name.trim() ? body.race_name.trim().slice(0, 80) : null;
  return {
    race_name: raceName,
    race_date: body.race_date,
    days_available: days,
    weekly_hours: hours,
    goal,
    strengths: stringList(body.strengths, 'Strengths'),
    weaknesses: stringList(body.weaknesses, 'Weaknesses'),
  };
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
  validate: (data: T) => string[];
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs: number;
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
      effort: args.effort,
      timeoutMs: args.timeoutMs,
    });
    const errors = result.data ? args.validate(result.data) : [];
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
    prompt: outlinePrompt(athlete, inputs, coach, window),
    schema: OUTLINE_SCHEMA,
    validate: (o) => validateOutline(o, { totalWeeks: window.totalWeeks, daysAvailable: inputs.days_available }),
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
  const blockWeeks = outline.weeks.filter((w) => w.week >= 1 && w.week <= endWeek);
  const candidates = await loadCandidates(admin, athlete, {
    includeRaceSessions: blockWeeks.some((w) => w.phase === 'specific' || w.phase === 'taper'),
  });
  const weeklyMinutesMax = program.inputs.weekly_hours ? Math.round(program.inputs.weekly_hours * 60 * 1.1) : null;
  const coach = await loadCoachProfile(admin, athlete.id);
  const model = await modelFor(admin, 'confirmation_block');

  const result = await generateWithRepair<Block>({
    deps,
    settings,
    event: { userId: caller.userId, athleteId: athlete.id, programId: program.id, blockNo: 1, callType: 'confirmation_block' },
    model,
    system: systemPrompt(await readReferenceText(admin)),
    prompt: blockPrompt({ athlete, inputs: program.inputs, coach, outline, startWeek: 1, endWeek, candidates, weeklyMinutesMax }),
    schema: BLOCK_SCHEMA,
    validate: (b) =>
      validateBlock(b, {
        startWeek: 1,
        endWeek,
        outlineWeeks: outline.weeks,
        daysAvailable: program.inputs.days_available,
        weeklyMinutesMax,
        candidates,
      }),
    maxTokens: 32000,
    effort: deps.blockEffort,
    timeoutMs: BLOCK_TIMEOUT_MS,
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

  const sessions = await addTiming(admin, result.data, athlete.level);

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
    targets: { weeks: outline.weeks.filter((w) => w.week <= endWeek), weekly_minutes_max: weeklyMinutesMax },
    generated_at: now,
    last_error: null,
  }).eq('program_id', program.id).eq('block_no', 1);
  if (paidWith === 'credit') {
    await admin.from('athlete_credit_ledger').insert({
      athlete_id: athlete.id, kind: 'confirmation', delta: -1, reason: 'used', program_id: program.id,
    });
  }
}

const LEVEL_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

/** Adds plan_session timing to template sessions (timing always comes from the database). */
async function addTiming(admin: SupabaseClient, block: Block, level: AthleteRow['level']): Promise<Block> {
  const cache = new Map<string, Record<string, unknown>>();
  for (const week of block.weeks) {
    for (const session of week.sessions) {
      if (!session.template_id) continue;
      const key = `${session.method}|${session.duration_min}`;
      if (!cache.has(key)) {
        const { data, error } = await admin.rpc('plan_session', {
          p_method: session.method,
          p_minutes: session.duration_min,
          p_level: LEVEL_NAME[level],
        });
        if (error) throw new Error(`plan_session failed: ${error.message}`);
        cache.set(key, (Array.isArray(data) ? data[0] : data) ?? {});
      }
      session.timing = cache.get(key);
    }
  }
  return block;
}
