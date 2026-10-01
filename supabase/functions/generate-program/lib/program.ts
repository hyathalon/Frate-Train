import { type AthleteRow, type Caller, resolveAthlete } from './auth.ts';
import { availableFormats, type Candidates, isRunning, LEVEL_NAME, loadCandidates, loadRaceOption, type RaceOption } from './candidates.ts';
import type { CallClaude, ClaudeCallResult } from './claude.ts';
import type { Anthropic, SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';
import { allowanceFor, appAllowance, assertCanConfirm, assertCanPreview, coachAllowance } from './limits.ts';
import { blockContent, blockPrompt, type CoachProfile, outlinePrompt, type ProgramInputs, repairPrompt, systemPrompt } from './prompts.ts';
import { trimDeload } from './deload.ts';
import { placeRaceWeekStrength } from './fixups.ts';
import { homeOffFeet, intervalIntroWeek, runningLevel } from './running.ts';
import { longRunPlan } from './longruns.ts';
import { type Block, BLOCK_SCHEMA, type BlockWeek, CAN_DOUBLE, DAYS, normalizeBlock, type Outline, OUTLINE_SCHEMA, type OutlineWeek, type Limiter, LIMITERS, RUNNING_MODES, type RunningMode, STRENGTH_CHOICES, STRENGTH_PLACEMENTS, STRENGTH_SESSIONS_RANGE, TRAINING_AGES, VARIETY_PREFERENCES, EVENT_TYPES } from './schemas.ts';
import { type CallType, costUsd, loadSettings, type ModelChoice, modelFor, type Settings, setting } from './settings.ts';
import { dayStart, daysBetween, isValidDate, localDate, nextMonday, planWindow, weekdayOf } from './time.ts';
import { type BlockContext, type BlockSettings, deloadOptionalStrength, raceWeekStrengthDays, sessionFrame as validatorSessionFrame, strengthTarget, taperTarget, usualWeek, type Timing, timingKey, validateBlock, validateOutline } from './validate.ts';

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
const PREVIEW_REPAIR_TIMEOUT_MS = 45_000; // Haiku repairs take 10–20 s
const PREVIEW_BUDGET_MS = 135_000; // under the 150 s request limit
// A block call plus one repair must fit the 400 s Edge Function limit. High effort
// gets more time; its repair runs at medium.
const BLOCK_TIMEOUT_MS = { high: 210_000, other: 150_000 };
const REPAIR_TIMEOUT_MS = 150_000;
// Background work must finish inside the 400 s limit; skip a repair that wouldn't.
const BACKGROUND_BUDGET_MS = 385_000;
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
  const raceOption = typeof body.race_option_id === 'string' && body.race_option_id ? body.race_option_id : 'hyathlon-open';

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
  const limiters = stringList(body.limiters, 'Limiters', 2) as Limiter[];
  if (limiters.some((l) => !LIMITERS.includes(l))) {
    throw new HttpError(400, 'invalid_input', `Limiters must be up to 2 of: ${LIMITERS.join(', ')}.`);
  }
  // Onboarding 10d: default 2, or 3 when strength endurance holds them back.
  let strengthPref = limiters.includes('strength_endurance') ? 3 : 2;
  if (body.strength_sessions_pref !== undefined && body.strength_sessions_pref !== null) {
    strengthPref = Number(body.strength_sessions_pref);
    if (!Number.isInteger(strengthPref) || strengthPref < STRENGTH_SESSIONS_RANGE[0] || strengthPref > STRENGTH_SESSIONS_RANGE[1]) {
      throw new HttpError(400, 'invalid_input', `Strength sessions a week must be ${STRENGTH_SESSIONS_RANGE[0]} to ${STRENGTH_SESSIONS_RANGE[1]}.`);
    }
  }
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
    running: parseRunning(body.running),
    can_double: oneOf(body.can_double, CAN_DOUBLE, 'no', 'Can you train twice in a day: no, sometimes or yes.'),
    strength_placement: oneOf(body.strength_placement, STRENGTH_PLACEMENTS, 'with_hard_sessions', 'Strength sessions: with_hard_sessions or own_days.'),
    limiters,
    strength_sessions_pref: strengthPref,
    ...parseProfileExtras(body),
  };
}

/** Onboarding answers the prompt uses (1b, 1c, 2b, 3, 4, 6, 10a, 14, 15). All optional. */
function parseProfileExtras(body: Record<string, unknown>): Partial<ProgramInputs> {
  const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const day = (v: unknown) => ((DAYS as readonly unknown[]).includes(v) ? (v as string) : null);
  const date = (v: unknown, field: string) => {
    if (v === undefined || v === null || v === '') return null;
    if (!isValidDate(v)) throw new HttpError(400, 'invalid_input', `${field}: use a date like 2026-10-31.`);
    return v;
  };
  const list = (v: unknown, field: string, max: number) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > max) throw new HttpError(400, 'invalid_input', `${field} must be a list of up to ${max}.`);
    return v.map((x) => (x ?? {}) as Record<string, unknown>);
  };

  const strengthChoice = oneOf(body.strength_choice, STRENGTH_CHOICES, 'program', 'Strength: program, own or none.');
  const ownStrength = strengthChoice === 'own'
    ? list(body.own_strength, 'Your own strength or classes', 6).map((o) => {
      const days = Array.isArray(o.days) ? DAYS.filter((d) => (o.days as unknown[]).includes(d)) as string[] : [];
      if (!text(o.title, 60) || !days.length || (o.intensity !== 'hard' && o.intensity !== 'easy')) {
        throw new HttpError(400, 'invalid_input', 'Each of your own strength sessions or classes needs a title, its days, and whether it is hard or easy.');
      }
      return { title: text(o.title, 60)!, days, intensity: o.intensity as 'hard' | 'easy', details: text(o.details, 300) };
    })
    : [];
  let runsPerWeek: number | null = null;
  if (body.runs_per_week !== undefined && body.runs_per_week !== null) {
    runsPerWeek = Number(body.runs_per_week);
    if (!Number.isInteger(runsPerWeek) || runsPerWeek < 0 || runsPerWeek > 5) throw new HttpError(400, 'invalid_input', 'Runs per week must be 0 to 5 (5 means 5 or more).');
  }
  const rr = body.recent_result as Record<string, unknown> | null | undefined;
  const lr = body.last_race as Record<string, unknown> | null | undefined;
  return {
    interval_experience: body.interval_experience == null ? null : oneOf(body.interval_experience, ['yes', 'no'] as const, 'no', 'Interval experience: yes or no.'),
    can_run_20_min: body.can_run_20_min == null ? null : oneOf(body.can_run_20_min, ['yes', 'no'] as const, 'no', 'Can you run 20 minutes without stopping: yes or no.'),
    off_feet_includes: parseOffFeet(body.off_feet_includes),
    hyathlon_races_count: body.hyathlon_races_count == null ? null
      : oneOf(body.hyathlon_races_count, ['0', '1_2', '3_5', '6_plus'] as const, '0', 'Hyathlon races done: 0, 1_2, 3_5 or 6_plus.'),
    strength_choice: strengthChoice,
    own_strength: ownStrength,
    training_age: body.training_age == null ? null : oneOf(body.training_age, TRAINING_AGES, 'under_6_months', 'Training age: under_6_months, 6_12_months, 1_3_years or 3_plus_years.'),
    runs_per_week: runsPerWeek,
    recent_result: rr && text(rr.event, 80) && text(rr.time, 20)
      ? { event: text(rr.event, 80)!, time: text(rr.time, 20)!, date: date(rr.date, 'Recent result date'), avg_run_pace: text(rr.avg_run_pace, 20) }
      : null,
    variety_preference: body.variety_preference == null ? null : oneOf(body.variety_preference, VARIETY_PREFERENCES, 'balance', 'Variety: same, balance or variety.'),
    dislikes: text(body.dislikes, 300),
    preferred_long_run_day: day(body.preferred_long_run_day),
    last_race: lr && lr.date
      ? { type: oneOf(lr.type, EVENT_TYPES, 'other', `Last race type: ${EVENT_TYPES.join(', ')}.`), date: date(lr.date, 'Last race date')! }
      : null,
    other_events: list(body.other_events, 'Other events', 10).map((e) => {
      if (!text(e.name, 80) || !isValidDate(e.date) || (e.mode !== 'race' && e.mode !== 'training')) {
        throw new HttpError(400, 'invalid_input', 'Each event needs a name, a date, and whether you will race it or run it as training.');
      }
      return { name: text(e.name, 80)!, type: oneOf(e.type, EVENT_TYPES, 'other', `Event type: ${EVENT_TYPES.join(', ')}.`), date: e.date, mode: e.mode as 'race' | 'training' };
    }),
  };
}

/** Onboarding Q2c: what a no-running athlete wants off-feet (any of simulations, erg, bike). */
function parseOffFeet(value: unknown): ('simulations' | 'erg' | 'bike')[] | null {
  if (value === undefined || value === null) return null;
  const allowed = ['simulations', 'erg', 'bike'] as const;
  if (!Array.isArray(value) || value.some((v) => !allowed.includes(v))) {
    throw new HttpError(400, 'invalid_input', 'Off-feet choices: any of simulations, erg, bike.');
  }
  return allowed.filter((a) => value.includes(a));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T, message: string): T {
  if (value === undefined || value === null) return fallback;
  if (!allowed.includes(value as T)) throw new HttpError(400, 'invalid_input', message);
  return value as T;
}

function parseRunning(raw: unknown): ProgramInputs['running'] {
  const body = (raw ?? {}) as Record<string, unknown>;
  const mode = (body.mode ?? 'none') as RunningMode;
  if (!RUNNING_MODES.includes(mode)) {
    throw new HttpError(400, 'invalid_input', 'Choose your running: program my running, I already have a run plan, or no running.');
  }
  if (mode !== 'own_plan') return { mode, own_runs: [] };
  const runs = body.own_runs;
  if (!Array.isArray(runs) || runs.length < 1 || runs.length > 7) {
    throw new HttpError(400, 'invalid_input', 'Tell us which days you run, and whether each run is hard or easy.');
  }
  const seen = new Set<string>();
  const ownRuns = runs.map((r) => {
    const run = (r ?? {}) as Record<string, unknown>;
    if (!(DAYS as readonly unknown[]).includes(run.day) || seen.has(run.day as string) || (run.intensity !== 'hard' && run.intensity !== 'easy')) {
      throw new HttpError(400, 'invalid_input', 'Each run needs a day (Mon to Sun, once each) and whether it is hard or easy.');
    }
    seen.add(run.day as string);
    return { day: run.day as string, intensity: run.intensity as 'hard' | 'easy' };
  });
  return { mode, own_runs: DAYS.flatMap((d) => ownRuns.filter((r) => r.day === d)) };
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
    .select('strengths, weaknesses, priority_pillars, limiters, coach_notes, compromised_level')
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
  const { data, error } = await admin.from('generation_events').insert({
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
  }).select('id').single();
  if (error) console.error(`[generate-program] Could not record usage: ${error.message}`);
  return (data?.id as number | undefined) ?? null;
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

/** The emergency stop (app_settings.generation_paused), read before every Claude call. */
async function generationPaused(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from('app_settings').select('value').eq('key', 'generation_paused').maybeSingle();
  return Number(data?.value ?? 0) === 1;
}

/** One call plus automatic repairs when validation fails. Records every call. */
async function generateWithRepair<T>(args: {
  deps: Deps;
  settings: Settings;
  event: EventBase;
  model: ModelChoice;
  system: string;
  prompt: string | Anthropic.TextBlockParam[];
  history?: Anthropic.MessageParam[]; // earlier turns after the prompt (a repair of an earlier answer)
  attempts?: number; // default 2: one call plus one repair
  schema: Record<string, unknown>;
  validate: (data: T) => string[] | Promise<string[]>;
  maxTokens: number;
  effort?: 'low' | 'medium' | 'high' | null;
  timeoutMs: number;
  repairTimeoutMs?: number;
  deadline?: number; // Date.now() value by which all attempts must be done
  countsAs: string | null;
  paidWith: string | null;
}): Promise<{ data: T | null; error: string | null; eventId: number | null; text: string }> {
  const { deps, event, model } = args;
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: args.prompt }, ...(args.history ?? [])];
  let lastError: string | null = null;
  const attempts = args.attempts ?? 2;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await generationPaused(deps.admin)) {
      lastError = 'Generation is paused (app_settings.generation_paused).';
      break;
    }
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
    const eventId = await recordEvent(deps.admin, event, model, result, {
      ok,
      isRepair: attempt > 0 || !!args.history?.length,
      countsAs: args.countsAs,
      paidWith: args.paidWith,
      error: ok ? null : lastError,
    });
    await checkSpendAlert(deps, args.settings);
    if (ok) return { data: result.data, error: null, eventId, text: result.text };
    // Only a valid-but-rule-breaking answer is worth a repair turn, and only if it can finish in time.
    if (!result.data || errors.length === 0 || attempt + 1 >= attempts) break;
    if (args.deadline && Date.now() + (args.repairTimeoutMs ?? args.timeoutMs) > args.deadline) {
      lastError = `${lastError} (no time left for a repair)`;
      break;
    }
    messages.push({ role: 'assistant', content: result.text }, { role: 'user', content: repairPrompt(errors) });
  }
  return { data: null, error: lastError, eventId: null, text: '' };
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
    validate: (o) => validateOutline(o, {
      totalWeeks: window.totalWeeks,
      daysAvailable: inputs.training_days.length,
      running: inputs.running.mode,
      strengthPref: inputs.strength_sessions_pref ?? 2,
      strengthChoice: inputs.strength_choice ?? 'program',
      raceDay: weekdayOf(inputs.race_date),
      beginner: athlete.level === 'beginner',
      homeOffFeet: homeOffFeet(inputs, athlete.level),
    }),
    maxTokens: 16000,
    timeoutMs: PREVIEW_TIMEOUT_MS,
    // Two repairs, but the athlete is waiting: only start a repair that can finish in time.
    attempts: 3,
    repairTimeoutMs: PREVIEW_REPAIR_TIMEOUT_MS,
    deadline: Date.now() + PREVIEW_BUDGET_MS,
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
    .select('id, athlete_id, status, start_date, total_weeks, outline, inputs')
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
  start_date: string;
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
  const blockWeeks = outline.weeks.filter((w) => w.week >= 1 && w.week <= endWeek);
  const result = await generateBlockWeeks({
    deps, settings, caller, athlete, program, blockNo: 1, startWeek: 1, endWeek, callType: 'confirmation_block',
  });

  if (!result.block) {
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
  // The whole block counts as one confirmation, recorded on week 1's call.
  if (result.countEventId !== null) {
    await admin.from('generation_events').update({ counts_as: 'confirmation', paid_with: paidWith }).eq('id', result.countEventId);
  }
  const sessions = result.block;
  const frame = result.frame;

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

// ---------------------------------------------------------------------------
// Block generation, one week per call: week 1 first, then the other weeks in
// parallel from week 1 and the outline. Deload weeks are trimmed in code, then
// the whole block gets the cross-week checks (progression, deload size, long
// runs); a week that fails them gets one repair turn with its real previous week.
// ---------------------------------------------------------------------------

const WEEK_MAX_TOKENS = 16000;
const WEEK_ATTEMPTS = 3; // one call plus two repairs
const WEEK_RE = /^Week (\d+)\b/;

async function generateBlockWeeks(a: {
  deps: Deps;
  settings: Settings;
  caller: Caller;
  athlete: AthleteRow;
  program: ProgramRow;
  blockNo: number;
  startWeek: number;
  endWeek: number;
  callType: CallType;
  previousWeek?: BlockWeek;
  previousLongRunMin?: number | null;
}): Promise<{ block: Block | null; error: string | null; countEventId: number | null; frame: { warmup_min: number; cooldown_min: number } }> {
  const started = Date.now();
  const deadline = started + BACKGROUND_BUDGET_MS;
  const { deps, settings, athlete, program, startWeek, endWeek } = a;
  const { admin } = deps;
  const { outline, inputs } = program;
  const level = LEVEL_NAME[athlete.level];
  const weeks = outline.weeks.filter((w) => w.week >= startWeek && w.week <= endWeek);
  const prep = await prepareGeneration(admin, athlete, inputs, weeks);
  const { candidates, frame, tabataTimings, coach } = prep;
  const model = await modelFor(admin, a.callType);
  const effort = athlete.tier === 'member' ? model.effortMember : model.effortOther;
  const system = systemPrompt(await readReferenceText(admin));
  const raceDay = weekdayOf(inputs.race_date);
  const event = { userId: a.caller.userId, athleteId: athlete.id, programId: program.id, blockNo: a.blockNo, callType: a.callType };
  const ctx = (from: number, to: number, extra: Partial<BlockContext>, b?: Block): Promise<BlockContext> =>
    blockContext({ admin, settings, inputs, outline, totalWeeks: program.total_weeks, prep, level, from, to, raceDay, startDate: program.start_date, block: b, extra });
  const promptFor = (week: number, extra: { previousWeek?: BlockWeek; referenceWeek?: BlockWeek }) =>
    blockContent(blockPrompt({
      athlete, inputs, coach, outline, startWeek: week, endWeek: week, candidates, frame, tabataTimings,
      availableFormats: prep.availableFormats, plyoContacts: prep.plyoContacts, runExerciseIds: prep.runExerciseIds,
      raceStrengthDays: raceWeekStrengthDays(raceDay), ...extra,
    }));
  const call = (prompt: Anthropic.TextBlockParam[], validate: (b: Block) => Promise<string[]>, more: { history?: Anthropic.MessageParam[]; attempts?: number } = {}) =>
    generateWithRepair<Block>({
      deps, settings, event, model, system, prompt, schema: BLOCK_SCHEMA, validate,
      maxTokens: WEEK_MAX_TOKENS, effort,
      timeoutMs: effort === 'high' ? BLOCK_TIMEOUT_MS.high : BLOCK_TIMEOUT_MS.other,
      repairTimeoutMs: REPAIR_TIMEOUT_MS, deadline, countsAs: null, paidWith: null, attempts: WEEK_ATTEMPTS, ...more,
    });
  const trim = (week: BlockWeek, previous: BlockWeek | undefined, c: BlockContext, all?: BlockWeek[]) => {
    placeRaceWeekStrength(week, c);
    const taper = c.outlineWeeks.find((w) => w.week === week.week)?.phase === 'taper' && week.week !== c.finalWeek;
    if (taper && all) {
      // Taper: a share of usual volume (the last normal week), not of the week before.
      const usual = usualWeek(all, all.indexOf(week), a.previousWeek, c.outlineWeeks);
      const t = taperTarget(week.week, c.finalWeek);
      if (usual) trimDeload(week, usual, c, { min: t - 0.1, max: t + 0.1 });
    } else if (previous) trimDeload(week, previous, c);
  };
  const fail = (error: string | null) => ({ block: null, error, countEventId: null, frame });

  // Week 1: its real previous week is known (none for block 1).
  const first = await call(promptFor(startWeek, { previousWeek: a.previousWeek }), async (b) => {
    const n = normalizeBlock(b);
    const c = await ctx(startWeek, startWeek, { previousWeek: a.previousWeek }, n);
    if (n.weeks[0]) trim(n.weeks[0], a.previousWeek, c);
    return validateBlock(n, c);
  });
  if (!first.data) return fail(first.error);
  const week1 = first.data.weeks[0];

  // Weeks 2..N in parallel, each from week 1; cross-week checks wait for the whole block.
  const rest = await Promise.all(
    weeks.filter((w) => w.week > startWeek).map((w) =>
      call(promptFor(w.week, { referenceWeek: week1 }), async (b) => {
        const n = normalizeBlock(b);
        const c = await ctx(w.week, w.week, { previousWeek: week1, crossWeek: false }, n);
        if (n.weeks[0]) placeRaceWeekStrength(n.weeks[0], c);
        return validateBlock(n, c);
      })
    ),
  );
  const failed = rest.find((r) => !r.data);
  if (failed) return fail(failed.error);
  const block: Block = { summary: first.data.summary, weeks: [week1, ...rest.map((r) => r.data!.weeks[0])] };
  const texts = [first.text, ...rest.map((r) => r.text)];

  // Assemble: trim deloads against their real previous week, then the cross-week checks.
  const check = async () => {
    const c = await ctx(startWeek, endWeek, { previousWeek: a.previousWeek }, block);
    block.weeks.forEach((w, i) => trim(w, i > 0 ? block.weeks[i - 1] : a.previousWeek, c, block.weeks));
    return validateBlock(block, await ctx(startWeek, endWeek, { previousWeek: a.previousWeek }, block));
  };
  let errors = await check();
  for (let i = 1; i < block.weeks.length && errors.length; i++) {
    const week = block.weeks[i];
    const mine = errors.filter((e) => Number(WEEK_RE.exec(e)?.[1]) === week.week);
    if (!mine.length) continue;
    if (Date.now() + REPAIR_TIMEOUT_MS > deadline) return fail(`Failed checks: ${errors.slice(0, 5).join(' ')} (no time left for a repair)`);
    const previous = block.weeks[i - 1];
    const fixed = await call(promptFor(week.week, { previousWeek: previous }), async (b) => {
      const n = normalizeBlock(b);
      const c = await ctx(week.week, week.week, { previousWeek: previous }, n);
      if (n.weeks[0]) trim(n.weeks[0], previous, c);
      return validateBlock(n, c);
    }, {
      history: [{ role: 'assistant', content: texts[i] }, { role: 'user', content: repairPrompt(mine) }],
      attempts: WEEK_ATTEMPTS - 1,
    });
    if (!fixed.data) return fail(fixed.error);
    block.weeks[i] = fixed.data.weeks[0];
    texts[i] = fixed.text;
    errors = await check();
  }
  if (errors.length) return fail(`Failed checks: ${errors.slice(0, 5).join(' ')}`);

  const timed = addTiming(block, await partTimings(admin, block, level), frame, candidates, program.total_weeks);
  return { block: timed, error: null, countEventId: first.eventId, frame };
}

/**
 * Program weeks straight after an event the athlete raced (last race, or a
 * "race it" event): week 1 if the race was in the 7 days before the start.
 */
function postEventWeeks(inputs: ProgramInputs, startDate: string): number[] {
  const raced = [
    ...(inputs.last_race ? [inputs.last_race.date] : []),
    ...(inputs.other_events ?? []).filter((e) => e.mode === 'race').map((e) => e.date),
  ];
  const weeks = new Set<number>();
  for (const d of raced) {
    const days = daysBetween(startDate, d); // negative: before the program starts
    if (days < 0 && days >= -7) weeks.add(1);
    else if (days >= 0) weeks.add(Math.floor(days / 7) + 2);
  }
  return [...weeks];
}

/** The validator's context for weeks `from`..`to` of a program. */
async function blockContext(a: {
  admin: SupabaseClient;
  settings: Settings;
  inputs: ProgramInputs;
  outline: Outline;
  totalWeeks: number;
  prep: Awaited<ReturnType<typeof prepareGeneration>>;
  level: string;
  from: number;
  to: number;
  raceDay: string | null;
  startDate?: string;
  block?: Block;
  outlineWeeks?: OutlineWeek[];
  extra: Partial<BlockContext>;
}): Promise<BlockContext> {
  const { inputs } = a;
  return {
    availableFormats: a.prep.availableFormats,
    running: inputs.running?.mode ?? 'none',
    ownRuns: inputs.running?.own_runs ?? [],
    longestRunMin: inputs.longest_run_min ?? null,
    previousLongRunMin: a.extra.previousWeek ? lastLongRun([a.extra.previousWeek]) : null,
    finalWeek: a.totalWeeks,
    startWeek: a.from,
    endWeek: a.to,
    outlineWeeks: a.outlineWeeks ?? a.outline.weeks,
    trainingDays: inputs.training_days,
    canDouble: inputs.can_double ?? 'no',
    strengthPref: inputs.strength_sessions_pref ?? 2,
    strengthPlacement: inputs.strength_placement ?? 'with_hard_sessions',
    strengthChoice: inputs.strength_choice ?? 'program',
    beginner: a.level === 'Beginner',
    homeOffFeet: homeOffFeet(inputs, a.level.toLowerCase()),
    ownStrength: inputs.own_strength ?? [],
    raceDay: a.raceDay,
    postEventWeeks: a.startDate ? postEventWeeks(inputs, a.startDate) : [],
    intervalIntroWeek: intervalIntroWeek(inputs),
    advancedRunner: a.level === 'Advanced',
    offFeetIncludes: inputs.running?.mode === 'none' ? inputs.off_feet_includes ?? null : null,
    ownRacePace: !!inputs.recent_result?.avg_run_pace,
    longRunPlan: runningLevel(inputs) === 'normal'
      ? longRunPlan(inputs.longest_run_min, a.level === 'Advanced', a.outline.weeks, a.totalWeeks)
      : new Map(),
    runningBeginner: ['beginner_1', 'beginner_2'].includes(runningLevel(inputs) ?? ''),
    keySessionDay: inputs.key_session_day,
    minutesPerSession: inputs.minutes_per_session,
    frame: a.prep.frame,
    candidates: a.prep.candidates,
    timings: a.block ? await partTimings(a.admin, a.block, a.level) : new Map(),
    settings: blockSettings(a.settings),
    ...a.extra,
  };
}

/**
 * Which compromised sessions: the coach's choice (members), else standard (08 §A3) after
 * 3+ Hyathlon races or a completed program, else entry level (08 §A2b). A program is
 * completed when it was confirmed and its race date (its last week, for no-event
 * programs) has passed.
 */
async function compromisedLevelFor(
  admin: SupabaseClient, athlete: AthleteRow, inputs: ProgramInputs, coach: CoachProfile | null,
): Promise<'entry' | 'standard'> {
  if (coach?.compromised_level === 'entry' || coach?.compromised_level === 'standard') return coach.compromised_level;
  if (inputs.hyathlon_races_count === '3_5' || inputs.hyathlon_races_count === '6_plus') return 'standard';
  const { count, error } = await admin.from('training_programs').select('id', { count: 'exact', head: true })
    .eq('athlete_id', athlete.id).not('confirmed_at', 'is', null).lt('race_date', new Date().toISOString().slice(0, 10));
  if (error) throw new Error(`Could not count completed programs: ${error.message}`);
  return (count ?? 0) >= 1 ? 'standard' : 'entry';
}

/** Everything a block or week call needs besides the outline. */
async function prepareGeneration(admin: SupabaseClient, athlete: AthleteRow, inputs: ProgramInputs, weeks: OutlineWeek[]) {
  const level = LEVEL_NAME[athlete.level];
  const race = await requireRaceOption(admin, inputs.race_option_id);
  const coachProfile = await loadCoachProfile(admin, athlete.id);
  const compromisedLevel = await compromisedLevelFor(admin, athlete, inputs, coachProfile);
  const [candidates, frame, tabataTimings, coach, plyo] = await Promise.all([
    loadCandidates(admin, athlete, race, { includeRaceSessions: weeks.some((w) => w.phase === 'specific' || w.phase === 'taper'), compromisedLevel }),
    sessionFrame(admin, inputs.minutes_per_session),
    Promise.all([1, 2, 3, 4].map((n) => planFormat(admin, 'Tabata', 4 * n + 2 * (n - 1), level))),
    Promise.resolve(coachProfile),
    planFormat(admin, 'Plyometric', 10, level),
  ]);
  const running = inputs.running?.mode ?? 'none';
  return {
    candidates,
    frame,
    tabataTimings,
    coach,
    availableFormats: availableFormats(candidates, running, running === 'none' ? inputs.off_feet_includes ?? null : null),
    compromisedLevel,
    plyoContacts: Array.isArray(plyo.contacts) ? [Number(plyo.contacts[0]), Number(plyo.contacts[1])] as [number, number] : null,
    runExerciseIds: [...candidates.exercises.values()].filter(isRunning).map((e) => e.id),
  };
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
  const started = Date.now();
  const { admin } = deps;
  const settings = await loadSettings(admin);
  const level = LEVEL_NAME[athlete.level];
  const planned = program.outline.weeks.find((w) => w.week === week)!;
  const tired = reasons.includes('low energy') || reasons.includes('poor sleep');
  // Targets for this week: fewer core sessions if fewer days; a lighter (deload) week when tired.
  const raceDay = weekdayOf(inputs.race_date);
  const sctx = {
    running: inputs.running.mode, strengthPref: inputs.strength_sessions_pref ?? 2, strengthChoice: inputs.strength_choice ?? 'program',
    finalWeek: program.total_weeks, raceDay,
  };
  const deload = tired || planned.deload;
  let coreSessions = Math.min(planned.core_sessions, inputs.training_days.length * 2);
  // Fewer sessions can mean fewer strength sessions.
  let strengthSessions = Math.min(planned.strength_sessions ?? 0, strengthTarget({ ...planned, core_sessions: coreSessions }, sctx));
  let optionalSessions = planned.optional_sessions;
  if (tired && !planned.deload) {
    // A lighter (deload) week: 1 core strength session; the others become 1 optional one.
    const deloadStrength = strengthTarget({ ...planned, core_sessions: coreSessions, deload: true }, sctx);
    const dropped = Math.max(0, strengthSessions - deloadStrength);
    coreSessions = Math.max(1, coreSessions - dropped);
    strengthSessions = deloadStrength;
    optionalSessions = Math.min(2, optionalSessions + deloadOptionalStrength({ ...planned, core_sessions: coreSessions, deload: true }, sctx));
  }
  const target: OutlineWeek = {
    ...planned,
    core_sessions: coreSessions,
    strength_sessions: strengthSessions,
    optional_sessions: optionalSessions,
    ...(deload ? { deload: true, lever: 'deload' as const, load: 'Low' as const } : {}),
  };
  const index = block.sessions.weeks.findIndex((w) => w.week === week);
  const previousWeek: BlockWeek | undefined = index > 0 ? block.sessions.weeks[index - 1] : await lastWeekBefore(admin, program.id, block.block_no);
  const prep = await prepareGeneration(admin, athlete, inputs, [target]);
  const { candidates, frame, tabataTimings, coach } = prep;
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
    prompt: blockContent(blockPrompt({
      athlete, inputs, coach, outline: program.outline, startWeek: week, endWeek: week, candidates, frame, tabataTimings,
      availableFormats: prep.availableFormats, plyoContacts: prep.plyoContacts, runExerciseIds: prep.runExerciseIds,
      raceStrengthDays: raceWeekStrengthDays(raceDay), targetWeeks: [target], previousWeek, adjustment,
    })),
    schema: BLOCK_SCHEMA,
    validate: async (b) => {
      const n = normalizeBlock(b);
      const c = await blockContext({
        admin, settings, inputs, outline: program.outline, totalWeeks: program.total_weeks, prep, level, from: week, to: week, raceDay,
        startDate: program.start_date,
        block: n, outlineWeeks: [target],
        extra: { previousWeek, previousLongRunMin: lastLongRun(block.sessions.weeks.filter((w) => w.week < week)) },
      });
      if (n.weeks[0]) placeRaceWeekStrength(n.weeks[0], c);
      if (previousWeek && n.weeks[0]) trimDeload(n.weeks[0], previousWeek, c);
      return validateBlock(n, c);
    },
    maxTokens: 16000,
    effort,
    timeoutMs: effort === 'high' ? BLOCK_TIMEOUT_MS.high : BLOCK_TIMEOUT_MS.other,
    repairTimeoutMs: REPAIR_TIMEOUT_MS,
    deadline: started + BACKGROUND_BUDGET_MS,
    countsAs: null,
    paidWith: null,
  });

  if (!result.data) {
    await admin.from('weekly_checkins').update({ status: 'failed', last_error: "We couldn't adjust this week. Your planned week is unchanged." }).eq('id', checkinId);
    return;
  }
  const adjusted = addTiming(result.data, await partTimings(admin, result.data, level), frame, candidates, program.total_weeks).weeks[0];
  const sessions: Block = { ...block.sessions, weeks: block.sessions.weeks.map((w) => (w.week === week ? adjusted : w)) };
  await admin.from('program_blocks').update({ sessions }).eq('id', block.id);
  await admin.from('weekly_checkins').update({ status: 'adjusted', previous_week: block.sessions.weeks[index] ?? null }).eq('id', checkinId);
}

/** Minutes of the last long run in these weeks, if any. */
function lastLongRun(weeks: BlockWeek[]): number | null {
  let last: number | null = null;
  for (const w of weeks) for (const s of w.sessions) for (const p of s.parts) if (p.format === 'Run' && p.run_type === 'long') last = p.minutes;
  return last;
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

/** Attaches each part's timing and each session's warm-up / cool-down (short strength sessions use their template's). */
function addTiming(
  block: Block,
  timings: Map<string, Timing>,
  frame: { warmup_min: number; cooldown_min: number },
  candidates: Candidates,
  finalWeek: number,
): Block {
  for (const week of block.weeks) {
    for (const session of week.sessions) {
      for (const part of session.parts) part.timing = timings.get(timingKey(part.format, part.minutes));
      const f = validatorSessionFrame(session, week.week === finalWeek, { frame, candidates });
      session.frame = { ...f, total_min: f.warmup_min + f.cooldown_min + session.parts.reduce((m, p) => m + p.minutes, 0) };
    }
  }
  return block;
}
