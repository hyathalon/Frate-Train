import { type Candidates, type Exercise, isBike, isBodyweightOnly, isErg, isRowOrSki, isRunning, isWalking, partMinutes, slotMatches, type Template } from './candidates.ts';
import { type Block, type BlockWeek, type CanDouble, DAYS, type Outline, type OutlineWeek, type OwnStrengthSession, type RunningMode, type Session, type SessionPart, type StrengthChoice, type StrengthPlacement } from './schemas.ts';

// Each validator returns plain-English errors. An empty list means valid.
// The same messages go back to Claude in the one automatic repair attempt.

/**
 * Taper weeks including race week. Hyathlon races (the only goal so far) taper 8–14
 * days: race week + the week before (09 §5). Marathon/half goals (later) taper ~3 weeks.
 */
export function taperWeeks(totalWeeks: number, goal: 'hyathlon' | 'marathon' | 'half_marathon' = 'hyathlon'): number {
  if (goal === 'marathon') return totalWeeks >= 12 ? 3 : 2; // 6–11 weeks 2; up to 5 weeks race week + 1
  if (goal === 'half_marathon') return totalWeeks < 8 ? 1 : 2;
  return 2;
}

export interface OutlineContext {
  totalWeeks: number;
  daysAvailable: number;
  running: RunningMode;
  strengthPref: number;
  strengthChoice?: StrengthChoice; // default 'program'
  raceDay: string | null; // weekday of the race, in the final week
  beginner?: boolean; // beginners: one run/conditioning session per training day, strength as second sessions
  homeOffFeet?: boolean; // home beginner, no running, no ergs/bike: key + strength; other days rest or easy walk
}

/** Race week gets one short maintain strength session, at least 5 days before the race. */
export function raceWeekStrengthDays(raceDay: string | null): string[] {
  const i = raceDay ? DAYS.indexOf(raceDay as (typeof DAYS)[number]) : -1;
  return i >= 5 ? DAYS.slice(0, i - 4) : [];
}

/**
 * Strength sessions a week: the athlete's choice, in the core sessions left after
 * the running and hybrid needs. Taper weeks 1; race week 1 if a day at least
 * 5 days before the race falls in it, otherwise 0.
 */
export function strengthTarget(
  week: Pick<OutlineWeek, 'week' | 'phase' | 'core_sessions'> & { deload?: boolean },
  ctx: StrengthCtx,
): number {
  if ((ctx.strengthChoice ?? 'program') !== 'program') return 0; // own strength/classes, or none
  if (week.week === ctx.finalWeek) return raceWeekStrengthDays(ctx.raceDay).length ? 1 : 0;
  if (week.phase === 'taper') return 1;
  const normal = Math.min(ctx.strengthPref, Math.max(0, week.core_sessions - weeklyOthers(ctx.running, week.core_sessions).length));
  return week.deload ? Math.min(1, normal) : normal; // deload: 1 required (+ 1 optional, see deloadOptionalStrength)
}

type StrengthCtx = { running: RunningMode; strengthPref: number; strengthChoice?: StrengthChoice; finalWeek: number; raceDay: string | null };

/** Deload weeks add 1 optional strength session when the athlete normally does 2 or more. */
export function deloadOptionalStrength(week: Pick<OutlineWeek, 'week' | 'phase' | 'core_sessions' | 'deload'>, ctx: StrengthCtx): number {
  if (!week.deload || week.week === ctx.finalWeek || week.phase === 'taper' || (ctx.strengthChoice ?? 'program') !== 'program') return 0;
  return ctx.strengthPref >= 2 && strengthTarget(week, ctx) >= 1 ? 1 : 0;
}

export function validateOutline(outline: Outline, ctx: OutlineContext): string[] {
  const errors: string[] = [];
  const { weeks, phases } = outline;

  if (weeks.length !== ctx.totalWeeks) {
    errors.push(`The outline must have exactly ${ctx.totalWeeks} weeks; it has ${weeks.length}.`);
  }
  weeks.forEach((w, i) => {
    if (w.week !== i + 1) errors.push(`Weeks must be numbered 1 to ${ctx.totalWeeks} in order; position ${i + 1} is week ${w.week}.`);
    // Up to 2 sessions a day, so up to twice the training days.
    if (w.core_sessions < 1 || w.core_sessions > ctx.daysAvailable * 2) {
      errors.push(`Week ${w.week}: core_sessions must be between 1 and ${ctx.daysAvailable * 2} (${ctx.daysAvailable} training days, up to 2 sessions a day); it is ${w.core_sessions}.`);
    }
    if (w.optional_sessions < 0 || w.optional_sessions > 2) {
      errors.push(`Week ${w.week}: optional_sessions must be between 0 and 2; it is ${w.optional_sessions}.`);
    }
    if (w.pillars.length === 0) errors.push(`Week ${w.week}: list at least one pillar.`);
    const sctx = { ...ctx, finalWeek: ctx.totalWeeks };
    const strength = strengthTarget(w, sctx);
    if (w.strength_sessions !== strength) {
      errors.push(`Week ${w.week}: strength_sessions must be ${strength} (${(ctx.strengthChoice ?? 'program') !== 'program' ? 'the athlete does their own strength or none' : w.week === ctx.totalWeeks ? 'race week: one short maintain session at least 5 days before the race, if the week allows' : w.phase === 'taper' ? 'taper: 1 at maintain' : w.deload ? 'deload: 1 core strength session, plus 1 optional' : `the athlete chose ${ctx.strengthPref}, within ${w.core_sessions} core sessions`}); it is ${w.strength_sessions}.`);
    }
    if (ctx.homeOffFeet) {
      // Home beginner off-feet: exactly the key session + strength; intensity or volume weeks, never frequency.
      if (w.core_sessions !== 1 + w.strength_sessions) {
        errors.push(`Week ${w.week}: core_sessions must be ${1 + w.strength_sessions} (the key session + ${w.strength_sessions} strength); any extra session is an optional easy walk + mobility.`);
      }
      if (w.lever === 'frequency') errors.push(`Week ${w.week}: progress by intensity or volume; never the frequency lever for this athlete.`);
    }
    if (deloadOptionalStrength(w, sctx) > w.optional_sessions) {
      errors.push(`Week ${w.week}: a deload week has 1 optional strength session, so optional_sessions must be at least 1.`);
    }
    const needed = coreSessionsForStrength(ctx.running, ctx.daysAvailable, ctx.strengthPref, ctx.beginner, ctx.homeOffFeet);
    if (!ctx.homeOffFeet && w.week !== ctx.totalWeeks && w.phase !== 'taper' && !w.deload && (ctx.strengthChoice ?? 'program') === 'program' && w.core_sessions < needed) {
      errors.push(`Week ${w.week}: plan at least ${needed} core sessions so the athlete's ${ctx.strengthPref} strength sessions fit alongside the running and hybrid work (up to 2 sessions a day${ctx.beginner && !ctx.homeOffFeet ? '; beginners: a run or conditioning session on every training day, strength as second sessions' : ''}).`);
    }
    if (i === 0 && w.lever !== 'start') errors.push('Week 1 must use lever "start".');
    // Taper weeks (including race week) cut volume: lever "deload", like deload weeks.
    const cutsVolume = w.deload || w.phase === 'taper';
    if (i > 0 && cutsVolume && w.lever !== 'deload') {
      errors.push(`Week ${w.week} is a ${w.phase === 'taper' ? 'taper' : 'deload'} week, so its lever must be "deload".`);
    }
    if (i > 0 && !cutsVolume && (w.lever === 'start' || w.lever === 'deload')) {
      errors.push(`Week ${w.week} must progress one lever: frequency, intensity or volume.`);
    }
    // A frequency week adds a session (as optional first), so it plans more sessions than the week before.
    const prev = weeks[i - 1];
    if (i > 0 && w.lever === 'frequency' && w.core_sessions + w.optional_sessions <= prev.core_sessions + prev.optional_sessions) {
      errors.push(`Week ${w.week} uses the frequency lever, so it adds a session: plan more core + optional sessions than week ${prev.week} (${prev.core_sessions} + ${prev.optional_sessions}).`);
    }
  });

  // Taper length by program length: 12+ weeks → 3; otherwise 2 (6–11 weeks, and race week + 1 up to 5 weeks).
  const taper = taperWeeks(ctx.totalWeeks);
  weeks.forEach((w) => {
    const inTaper = w.week > ctx.totalWeeks - taper;
    if (inTaper && w.phase !== 'taper') errors.push(`Week ${w.week} is in the ${taper}-week taper (a ${ctx.totalWeeks}-week program), so its phase is taper.`);
    if (!inTaper && w.phase === 'taper') errors.push(`Week ${w.week} is before the ${taper}-week taper (a ${ctx.totalWeeks}-week program), so it isn't taper yet.`);
  });

  // Phases must cover weeks 1..N without gaps or overlaps, and match each week's phase.
  const sorted = [...phases].sort((a, b) => a.start_week - b.start_week);
  let expected = 1;
  for (const p of sorted) {
    if (p.start_week !== expected || p.end_week < p.start_week) {
      errors.push(`Phases must cover weeks 1 to ${ctx.totalWeeks} without gaps or overlaps (problem at "${p.name}").`);
      break;
    }
    expected = p.end_week + 1;
  }
  if (expected !== ctx.totalWeeks + 1 && errors.every((e) => !e.startsWith('Phases'))) {
    errors.push(`Phases must end at week ${ctx.totalWeeks}.`);
  }
  for (const w of weeks) {
    const phase = sorted.find((p) => w.week >= p.start_week && w.week <= p.end_week);
    if (phase && phase.kind !== w.phase) {
      errors.push(`Week ${w.week} is marked "${w.phase}" but falls in the "${phase.kind}" phase.`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type Timing = Record<string, unknown>;
export const timingKey = (format: string, minutes: number) => `${format}|${Math.round(minutes)}`;

export interface BlockSettings {
  minutesTolerance: number;
  deloadMin: number;
  deloadMax: number;
  deloadSessionMinRatio: number;
  runShareMax: number;
}

export interface BlockContext {
  startWeek: number;
  endWeek: number;
  outlineWeeks: Outline['weeks'];
  trainingDays: string[];
  canDouble: CanDouble;
  strengthPref: number; // strength sessions a week the athlete chose
  strengthPlacement: StrengthPlacement;
  strengthChoice?: StrengthChoice; // default 'program'
  beginner?: boolean; // beginners: strength as second sessions on quality days
  homeOffFeet?: boolean; // home beginner, no running, no ergs/bike (the weekly shape in system-prompt.md)
  ownStrength?: OwnStrengthSession[]; // strength_choice 'own': the athlete's own strength/classes
  raceDay: string | null; // weekday of the race (final week)
  postEventWeeks?: number[]; // weeks straight after a raced event
  intervalIntroWeek?: number | null; // programmed running: first week with a quality interval session (null: not yet)
  runningBeginner?: boolean; // programmed running, Beginner 1–2: 3 runs + cross-training, never 3 days in a row
  advancedRunner?: boolean; // long runs RPE 6–7 and up to 120 min (others RPE 5–6, up to 90 min)
  offFeetIncludes?: string[] | null; // running 'none' (onboarding Q2c): 'simulations', 'erg', 'bike'; null = not asked
  ownRacePace?: boolean; // the athlete has a stored race average run pace: their own paces may appear beside RPE
  raceSims?: RaceSims; // onboarding 2d (default plan_for_me)
  warnings?: string[]; // notes that don't fail the block (e.g. race-simulation spacing)
  skeleton?: boolean; // placement came from the code skeleton: placement checks are warnings, not failures
  highVolume?: boolean; // 4+ runs a week: the 8–14 day taper with its volume cut (low volume: ~7 days, no cut check)
  eventWeeks?: number[]; // weeks holding an A/B/C race other than the goal race: no deload-size check
  repeatPreference?: 'same_two_weeks' | 'alternate' | 'always_new'; // onboarding 14b
  beginnerRunner?: boolean; // beginners: no efforts in long runs
  longRunPlan?: Map<number, { label: string; minutes: [number, number] }>; // long-run stage per week (lib/longruns.ts)
  crossWeek?: boolean; // false while weeks are written in parallel: skip checks that need the real previous week
  keySessionDay: string;
  minutesPerSession: number;
  frame: { warmup_min: number; cooldown_min: number };
  candidates: Candidates;
  timings: Map<string, Timing>; // plan_format() results, keyed by timingKey
  settings: BlockSettings;
  previousWeek?: BlockWeek; // the last week of the previous block, if any
  availableFormats: Set<string>;
  running: RunningMode;
  ownRuns: { day: string; intensity: 'hard' | 'easy' }[]; // own_plan only
  longestRunMin: number | null; // longest run in the last 3 weeks (programmed running)
  previousLongRunMin: number | null; // the last long run already planned (later blocks)
  finalWeek: number; // race week, exempt from the weekly mix minimums
}

const DEFAULT_LEEWAY = 0.05;
const TAPER_LEEWAY = 0.1;

/** Taper volume as a share of usual (the last normal week): Hyathlon ~50%, i.e. down 40–60%. */
export function taperTarget(_week: number, _finalWeek: number): number {
  return 0.5; // Hyathlon: volume down 40–60% (±10% leeway); race week isn't checked
}

/** The last normal (not deload or taper) week before position i, in this block or the one before. */
export function usualWeek(weeks: BlockWeek[], i: number, previousWeek: BlockWeek | undefined, outline: Outline['weeks']): BlockWeek | undefined {
  const normal = (w: BlockWeek) => {
    const o = outline.find((x) => x.week === w.week);
    return w.progression.lever !== 'deload' && o?.phase !== 'taper' && !o?.deload;
  };
  for (let j = i - 1; j >= 0; j--) if (normal(weeks[j])) return weeks[j];
  return previousWeek && previousWeek.progression.lever !== 'deload' ? previousWeek : undefined;
}
const LONG_RUN_SESSION_MAX = 120;

// "10 reps", "3 x 10", "3 × 10" – but not "4 x 20 m" or "5 x 2 min".
const REPS_RE = /\b\d+\s*reps?\b|\b\d+\s*[x×]\s*\d+(?![\d.])(?!\s*(?:s|sec|secs|seconds|min|mins|minutes|m|km|cal|cals)\b)(?!\s*[-–(])/i;
const SETS_REPS_RE = /\b\d+\s*(?:sets?\s*(?:\([^)]*\)\s*)?)?[x×]\s*\d+/i;
const LOAD_BY_FEEL_RE = /\b(rpe|load|bodyweight|light|moderate|heavy|hard|intent|reps? left|by feel|race standard)\b/i;
// Coach's rule: intensity by RPE and feel, never fixed units or zones.
const FORBIDDEN_UNITS_RE = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs|watts?|w)\b|\bzone\s*\d/i;
// Paces only as the athlete's own stored values, beside RPE (never generic paces).
const PACE_RE = /\/\s*km\b|\bmin\/km\b|\bpace\s*\d/i;

function sessionSignature(s: Session): string {
  return JSON.stringify(s.parts.map((p) => [p.format, p.template_id, p.minutes, p.items.map((i) => [i.exercise_id, i.race_session_id, i.dose])]));
}

/**
 * A short strength session (the day's second session, or race week's) is one
 * 30- or 45-min Strength template with its own warm-up and cool-down.
 */
export function shortStrengthTemplate(s: Session, finalWeek: boolean, candidates: Candidates): Template | undefined {
  if (!(s.order_in_day === 2 || finalWeek) || !isStrengthOnly(s) || s.parts.length !== 1) return undefined;
  const t = s.parts[0].template_id ? candidates.templates.get(s.parts[0].template_id) : undefined;
  return t && SHORT_STRENGTH_MINUTES.includes(t.duration_min) ? t : undefined;
}
const SHORT_STRENGTH_MINUTES = [30, 45];

export function sessionFrame(s: Session, finalWeek: boolean, ctx: Pick<BlockContext, 'frame' | 'candidates'>) {
  const t = shortStrengthTemplate(s, finalWeek, ctx.candidates);
  return t ? { warmup_min: t.warmup_min, cooldown_min: t.cooldown_min } : ctx.frame;
}

export function sessionTotal(s: Session, finalWeek: boolean, ctx: Pick<BlockContext, 'frame' | 'candidates'>): number {
  const f = sessionFrame(s, finalWeek, ctx);
  return f.warmup_min + f.cooldown_min + s.parts.reduce((m, p) => m + p.minutes, 0);
}

export function coreMinutes(week: BlockWeek, ctx: Pick<BlockContext, 'frame' | 'candidates' | 'finalWeek'>): number {
  return week.sessions.filter((s) => !s.optional).reduce((sum, s) => sum + sessionTotal(s, week.week === ctx.finalWeek, ctx), 0);
}

function range(value: unknown): [number, number] | null {
  return Array.isArray(value) && value.length === 2 ? [Number(value[0]), Number(value[1])] : null;
}

export function validateBlock(block: Block, ctx: BlockContext): string[] {
  const errors: string[] = [];
  const expectedWeeks = ctx.endWeek - ctx.startWeek + 1;
  if (block.weeks.length !== expectedWeeks) {
    errors.push(`The block must have exactly ${expectedWeeks} weeks (weeks ${ctx.startWeek} to ${ctx.endWeek}); it has ${block.weeks.length}.`);
  }

  // With the code skeleton, placement is decided in code (and unit-tested): placement checks are warnings.
  const placement: string[] = ctx.skeleton ? (ctx.warnings ?? []) : errors;
  block.weeks.forEach((week, i) => {
    const label = `Week ${week.week}`;
    if (week.week !== ctx.startWeek + i) {
      errors.push(`Weeks must be numbered ${ctx.startWeek} to ${ctx.endWeek} in order; position ${i + 1} is week ${week.week}.`);
    }
    const plan = ctx.outlineWeeks.find((w) => w.week === week.week);
    const previous = i > 0 ? block.weeks[i - 1] : ctx.previousWeek;
    const core = week.sessions.filter((s) => !s.optional);
    const optional = week.sessions.filter((s) => s.optional);

    // Counts follow the outline.
    if (plan && core.length !== plan.core_sessions) {
      placement.push(`${label}: the outline has ${plan.core_sessions} core sessions; the block has ${core.length}.`);
    }
    if (plan && optional.length > plan.optional_sessions) {
      placement.push(`${label}: at most ${plan.optional_sessions} optional sessions; the block has ${optional.length}.`);
    }

    // Days: only the athlete's days, one core session per day, key session on the key day.
    for (const s of week.sessions) {
      if (!ctx.trainingDays.includes(s.day)) errors.push(`${label}: "${s.title}" is on ${s.day}, which isn't one of the athlete's training days (${ctx.trainingDays.join(', ')}).`);
    }
    checkDays(week, label, ctx, placement);
    const keys = core.filter((s) => s.key_session);
    if (keys.length !== 1) errors.push(`${label}: mark exactly one core session as the key session.`);
    else if (keys[0].day !== ctx.keySessionDay && !(week.week === ctx.finalWeek && ctx.running === 'programmed')) {
      placement.push(`${label}: the key session must be on ${ctx.keySessionDay}.`);
    }
    if (week.week === ctx.finalWeek && ctx.running === 'programmed') checkRaceWeekRuns(week, label, placement);
    if (optional.some((s) => s.key_session)) errors.push(`${label}: optional sessions can't be the key session.`);
    if (keys.length === 1) checkKeySession(keys[0], week.week, label, plan?.phase === 'taper' || week.week === ctx.finalWeek || (ctx.postEventWeeks ?? []).includes(week.week), ctx, errors);
    if (ctx.runningBeginner) checkBeginnerWeek(week, label, placement);
    checkStationSkillDays(week, label, placement);
    checkBackToBackIntervals(week, previous, label, placement);

    // Progression: one lever, matching the outline.
    if (plan && week.progression.lever !== plan.lever) {
      errors.push(`${label}: the outline's lever is "${plan.lever}" but the block uses "${week.progression.lever}".`);
    }
    const cross = ctx.crossWeek !== false;
    const freeDay = ctx.trainingDays.some((d) => !previous?.sessions.some((s) => s.day === d));
    if (cross && previous && freeDay && week.progression.lever === 'frequency' && week.sessions.length <= previous.sessions.length) {
      placement.push(`${label}: a frequency week must add a session (as optional first); it has ${week.sessions.length}, the week before had ${previous.sessions.length}.`);
    }
    const taper = plan?.phase === 'taper' && week.week !== ctx.finalWeek && ctx.highVolume !== false;
    const usual = taper ? usualWeek(block.weeks, i, ctx.previousWeek, ctx.outlineWeeks) : undefined;
    if (cross && taper && usual) {
      // Taper: ~80%, then ~60% of usual volume (the last normal week), counting back from race week.
      const [target, ratio] = [taperTarget(week.week, ctx.finalWeek), coreMinutes(week, ctx) / Math.max(1, coreMinutes(usual, ctx))];
      if (Math.abs(ratio - target) > TAPER_LEEWAY) {
        placement.push(`${label}: this taper week should be about ${Math.round(target * 100)}% of usual volume (week ${usual.week}'s core minutes); it is ${Math.round(ratio * 100)}%.`);
      }
    } else if (cross && previous && week.progression.lever === 'deload' && week.week !== ctx.finalWeek && !(ctx.eventWeeks ?? []).includes(week.week)
      && plan?.phase !== 'taper') { // race week, event weeks and low-volume taper: no size rule
      const ratio = coreMinutes(week, ctx) / Math.max(1, coreMinutes(previous, ctx));
      const lo = ctx.settings.deloadMin - DEFAULT_LEEWAY, hi = ctx.settings.deloadMax + DEFAULT_LEEWAY;
      if (ratio < lo || ratio > hi) {
        placement.push(`${label}: a deload week should be about ${Math.round(ctx.settings.deloadMin * 100)}–${Math.round(ctx.settings.deloadMax * 100)}% of the previous week's core minutes; it is ${Math.round(ratio * 100)}%.`);
      }
    }
    if (previous) {
      checkRepeats(week, previous, i > 1 ? block.weeks[i - 2] : undefined, label, ctx, errors);
    }

    const final = week.week === ctx.finalWeek;
    week.sessions.forEach((s, j) => validateSession(s, `${label}, session ${j + 1} ("${s.title}")`, week.progression.lever === 'deload', final, ctx, errors));
    const strengthCount = plan?.strength_sessions ?? strengthTarget({ week: week.week, phase: plan?.phase ?? 'base', core_sessions: core.length, deload: plan?.deload }, ctx);
    const optionalStrength = plan ? deloadOptionalStrength(plan, ctx) : 0;
    if (!final) checkWeeklyMix(core, label, ctx, strengthCount, placement);
    checkInterference(week, label, ctx, errors);
    checkEasyDays(week, label, ctx, strengthCount, placement);
    checkStrengthWeek(week, label, ctx, strengthCount, optionalStrength, plan?.phase === 'taper' || !!plan?.deload || final, placement);
  });
  if (ctx.running === 'programmed' && ctx.crossWeek !== false) checkLongRuns(block, ctx, errors);
  if (ctx.running === 'programmed') checkLongRunTargets(block, ctx, errors);
  if (ctx.crossWeek !== false) checkRaceSims(block, ctx, placement);
  return errors;
}

// ---------------------------------------------------------------------------
// Key session: a real quality session
// ---------------------------------------------------------------------------

const NEVER_KEY_TYPES = ['station_skill', 'easy_steady', 'recovery'];
const RPE_RE = /\bRPE\s*(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/gi;

/** The highest RPE a dose names, if any. */
function maxRpe(dose: string): number | null {
  let max: number | null = null;
  for (const m of dose.matchAll(RPE_RE)) max = Math.max(max ?? 0, Number(m[2] ?? m[1]));
  return max;
}

/**
 * The key session is a quality session. Running programmed: the main interval
 * session (a key Run part at RPE 8+). Otherwise: a hard (build) strength session,
 * a race simulation or a compromised session. Never station skill, easy,
 * recovery or core/mobility, except core/mobility in a taper or post-event week.
 */
function checkKeySession(s: Session, weekNo: number, label: string, taperOrPostEvent: boolean, ctx: BlockContext, errors: string[]) {
  if (ctx.running === 'programmed' && weekNo === ctx.finalWeek) {
    checkRaceWeekSharpener(s, label, ctx, errors);
    return;
  }
  const coreMobility = s.parts.every((p) => p.format === 'Mobility' || p.items.every((it) => {
    const e = it.exercise_id ? ctx.candidates.exercises.get(it.exercise_id) : undefined;
    return e?.movement_pattern === 'Core' || e?.movement_pattern === 'Mobility';
  }));
  if (coreMobility) {
    if (!taperOrPostEvent) errors.push(`${label}: the key session "${s.title}" is core/mobility work; that is only the week's main session in a taper or post-event week.`);
    return;
  }
  // Programmed running before the first interval session (30 s efforts come first): the key
  // session is the week's main aerobic run, which may be an easy/steady run.
  const beforeIntervals = ctx.running === 'programmed' && (ctx.intervalIntroWeek === null || (ctx.intervalIntroWeek !== undefined && weekNo < ctx.intervalIntroWeek));
  if (beforeIntervals) {
    if (s.session_type === 'station_skill' || s.session_type === 'recovery') {
      errors.push(`${label}: the key session "${s.title}" is ${s.session_type.replace('_', ' ')}; before the first interval session it is the week's main aerobic run.`);
    } else if (!s.parts.some((p) => p.format === 'Run' && p.run_type !== 'recovery')) {
      errors.push(`${label}: before the first interval session, the key session is the week's main aerobic run (a Run part); "${s.title}" has none.`);
    }
    return;
  }
  if (NEVER_KEY_TYPES.includes(s.session_type)) {
    errors.push(`${label}: the key session "${s.title}" is ${s.session_type.replace('_', ' ')}; the key session is a quality session (for beginners, a smaller dose, never an easy circuit).`);
    return;
  }
  if (taperOrPostEvent || ctx.finalWeek === undefined) return;
  if (ctx.running === 'programmed' && ctx.raceSims?.choice === 'my_plan' && isSim(s)) return; // the athlete's own simulation is the key session
  if (ctx.running === 'programmed') {
    const key = s.parts.filter((p) => p.format === 'Run' && p.run_type === 'key');
    if (!key.length) {
      errors.push(`${label}: with running programmed, the key session is the main interval session (a Run part with run_type key); "${s.title}" has none.`);
    } else if (key.every((p) => p.items.every((it) => (maxRpe(it.dose) ?? 0) < 8))) {
      errors.push(`${label}: the key session "${s.title}" is the main interval session at RPE 8 or more.`);
    }
    return;
  }
  // No programmed running: a hard strength session, off-feet intervals at RPE 8+ (erg, bike or
  // bodyweight), a race simulation, or a hard AMRAP/EMOM-type workout; with their own run plan,
  // compromised sessions too.
  const hardStrength = s.parts.some((p) => p.format === 'Strength') && s.build_or_maintain === 'build';
  const offFeetIntervals = s.parts.some((p) => p.format === 'Tabata'
    || (p.format === 'HIIT' && p.items.some((it) => (maxRpe(it.dose) ?? 0) >= 8 || /\b(max|hard|all[- ]out)\b/i.test(it.dose))));
  const workout = s.parts.some((p) => ['AMRAP', 'EMOM', 'ForTime'].includes(p.format));
  const simulation = s.parts.some((p) => p.format === 'RaceSim' || (ctx.running === 'none' && p.format === 'CompromisedRun'));
  const compromised = ctx.running === 'own_plan' && s.parts.some((p) => p.format === 'Compromised' || p.format === 'CompromisedRun');
  if (ctx.homeOffFeet) {
    if (!offFeetIntervals && !workout) {
      errors.push(`${label}: the key session is bodyweight intervals or an AMRAP/EMOM at RPE 8+ (e.g. 6–10 × 40 s hard / 20–40 s easy, or a 12–16 min AMRAP), never an easy technique circuit; "${s.title}" is neither.`);
    }
    return;
  }
  if (!hardStrength && !offFeetIntervals && !workout && !simulation && !compromised) {
    errors.push(`${label}: without programmed running, the key session is a hard strength session, an off-feet interval session at RPE 8+, a race simulation${ctx.running === 'own_plan' ? ', a compromised session' : ''} or a hard AMRAP/EMOM-type workout; "${s.title}" is none of these.`);
  }
}

/**
 * Race week (running programs): the key session is a short sharpener at least 4–5 days
 * before the race: 15 min just slower than race effort (RPE 8) with easy warm-up and cool-down.
 */
function checkRaceWeekSharpener(s: Session, label: string, ctx: BlockContext, errors: string[]) {
  const key = s.parts.filter((p) => p.format === 'Run' && p.run_type === 'key');
  const race = ctx.raceDay ? DAYS.indexOf(ctx.raceDay as (typeof DAYS)[number]) : -1;
  if (!key.length) {
    errors.push(`${label}: race week's key session is a short sharpener run (a Run part with run_type key); "${s.title}" has none.`);
    return;
  }
  const rpe = Math.max(...key.flatMap((p) => p.items.map((it) => maxRpe(it.dose) ?? 0)));
  if (rpe < 7.5 || rpe > 8.5) errors.push(`${label}: the race-week sharpener is 15 min just slower than race effort (RPE 8); "${s.title}" says RPE ${rpe || 'nothing'}.`);
  if (key.some((p) => p.minutes > 45)) errors.push(`${label}: the race-week sharpener is short (15 min at RPE 8 with 10–15 min easy either side).`);
  if (race >= 0 && race - DAYS.indexOf(s.day) < 4) {
    errors.push(`${label}: the race-week sharpener is at least 4–5 days before the race (${DAYS.slice(0, Math.max(0, race - 3)).join(' or ') || 'no day this week'}); it is on ${s.day}.`);
  }
}

/** Race week: apart from the sharpener, runs are easy (easy or recovery; no long run). */
function checkRaceWeekRuns(week: BlockWeek, label: string, errors: string[]) {
  for (const s of week.sessions) {
    for (const p of s.parts) {
      if (p.format === 'Run' && (p.run_type === 'long' || (p.run_type === 'key' && !s.key_session))) {
        errors.push(`${label}: "${s.title}": in race week, runs other than the sharpener are easy (no ${p.run_type} run).`);
      }
    }
  }
}

/**
 * Running beginners: never 3 training days in a row, and the day after the long run
 * is the absorption run or cross-training (easy), if anything.
 */
/**
 * Home beginner, no running, no ergs/bike: one strength session straight after the key
 * session (the same visit; fine when can_double is "no"), the other may stand alone;
 * station skill only as a ≤10 min add-on on a strength day; other days rest, or an easy
 * brisk walk and mobility.
 */
function checkHomeOffFeetWeek(week: BlockWeek, label: string, ctx: BlockContext, strength: Session[], errors: string[]) {
  const key = week.sessions.find((s) => s.key_session && !s.optional);
  if (key && strength.length && !strength.some((s) => s.day === key.day && s.order_in_day === 2)) {
    errors.push(`${label}: one strength session goes straight after the key session ("${key.title}", ${key.day}) as its own session (order_in_day 2).`);
  }
  const strengthDays = new Set(week.sessions.filter(isStrengthSession).map((s) => s.day));
  for (const s of week.sessions) {
    if (s === key || isStrengthSession(s)) {
      for (const p of s.parts.filter((x) => x.format === 'Station' && x.minutes > 10)) {
        errors.push(`${label}: "${s.title}": station skill is a short add-on (10 min or less); this part is ${p.minutes} min.`);
      }
      continue;
    }
    if (s.session_type === 'station_skill') {
      if (!strengthDays.has(s.day)) errors.push(`${label}: "${s.title}": station skill only as a short add-on on a strength day.`);
      continue;
    }
    const easy = isEasySession(s) || isRecoverySession(s);
    if (!easy || s.parts.some((p) => p.format !== 'Aerobic' && p.format !== 'Mobility')) {
      errors.push(`${label}: "${s.title}" on ${s.day}: other days are rest, or an easy brisk walk (RPE 5–6) and mobility; no circuits or hard work.`);
    }
  }
}

const INTERVAL_FORMATS = ['HIIT', 'Tabata', 'Compromised', 'CompromisedRun', 'RaceSim'];
const INTERVAL_TYPES = ['lactate_threshold', 'critical_velocity', 'vo2max', 'speed', 'compromised'];

/** An interval (quality) session: a key run, interval-type work, or an interval session type. */
export function isIntervalSession(s: Session): boolean {
  return INTERVAL_TYPES.includes(s.session_type)
    || s.parts.some((p) => INTERVAL_FORMATS.includes(p.format) || (p.format === 'Run' && p.run_type === 'key'));
}

/**
 * HARD RULE, no exceptions: never two interval (quality) sessions on back-to-back days,
 * including Sunday → Monday across weeks. Optional sessions count.
 */
function checkBackToBackIntervals(week: BlockWeek, previous: BlockWeek | undefined, label: string, errors: string[]) {
  const on = (w: BlockWeek | undefined, day: string) => w?.sessions.find((s) => s.day === day && isIntervalSession(s));
  for (let i = 0; i < DAYS.length; i++) {
    const today = on(week, DAYS[i]);
    if (!today) continue;
    const before = i > 0 ? on(week, DAYS[i - 1]) : on(previous, 'Sun');
    if (before) {
      errors.push(`${label}: "${before.title}" (${i > 0 ? DAYS[i - 1] : 'Sun, the week before'}) and "${today.title}" (${DAYS[i]}) are interval sessions on back-to-back days; leave at least one non-interval day between them (hard rule).`);
    }
  }
}

/** Station skill is warm-up, strength-day or short add-on work: never a day's only main session. */
function checkStationSkillDays(week: BlockWeek, label: string, errors: string[]) {
  for (const day of DAYS) {
    const sessions = week.sessions.filter((s) => s.day === day);
    if (sessions.length && sessions.every((s) => s.session_type === 'station_skill')) {
      errors.push(`${label}: "${sessions[0].title}" is station skill work on its own on ${day}; station skill is warm-up, strength-day or short add-on work, never a day's only main session.`);
    }
  }
}

// Words in titles that name equipment: the session must use it.
const TITLE_EQUIPMENT: { word: RegExp; equipment: string[] }[] = [
  { word: /\bski\s*-?erg\b/i, equipment: ['SkiErg'] },
  { word: /\b(rower|rowing|row\s*erg)\b/i, equipment: ['Rower'] },
  { word: /\bbike\s*-?erg\b/i, equipment: ['BikeErg'] },
  { word: /\b(air\s*bike|assault\s*bike|echo\s*bike)\b/i, equipment: ['Air bike'] },
  { word: /\bsled\b/i, equipment: ['Sled'] },
  { word: /\bbarbell\b/i, equipment: ['Barbell'] },
  { word: /\bkettlebell\b/i, equipment: ['Kettlebell', 'Kettlebell or dumbbell'] },
  { word: /\bdumbbell\b/i, equipment: ['Dumbbell', 'Kettlebell or dumbbell'] },
  { word: /\bwall\s*-?balls?\b/i, equipment: ['Wall ball'] },
  { word: /\bsandbag\b/i, equipment: ['Sandbag'] },
  { word: /\btreadmill\b/i, equipment: ['Treadmill'] },
  { word: /\b(swim|swimming|pool)\b/i, equipment: ['Pool (swimming)', 'Pool (aqua running)'] },
];

/** A session title names only exercises and equipment actually in the session. */
function checkTitle(s: Session, where: string, ctx: BlockContext, errors: string[]) {
  const exercises = s.parts.flatMap((p) => p.items).map((it) => (it.exercise_id ? ctx.candidates.exercises.get(it.exercise_id) : undefined))
    .filter((e): e is Exercise => !!e);
  for (const t of TITLE_EQUIPMENT) {
    if (!t.word.test(s.title)) continue;
    const used = exercises.some((e) => t.word.test(e.name) || e.equipment_options.some((opt) => opt.some((n) => t.equipment.includes(n))));
    const race = s.parts.some((p) => p.items.some((it) => it.race_session_id)); // race sessions name their own stations
    if (!used && !race) errors.push(`${where}: the title names ${s.title.match(t.word)![0]}, but no exercise in the session uses it; title the session by what it contains.`);
  }
}

function checkBeginnerWeek(week: BlockWeek, label: string, errors: string[]) {
  const trained = DAYS.map((d) => week.sessions.some((s) => s.day === d));
  for (let i = 0; i + 2 < DAYS.length; i++) {
    if (trained[i] && trained[i + 1] && trained[i + 2]) {
      errors.push(`${label}: running beginners never train 3 days in a row (${DAYS[i]}–${DAYS[i + 2]}).`);
      break;
    }
  }
  const long = week.sessions.find((s) => s.parts.some((p) => p.format === 'Run' && p.run_type === 'long'));
  const next = long ? DAYS[DAYS.indexOf(long.day) + 1] : undefined;
  for (const s of week.sessions.filter((x) => next && x.day === next)) {
    if (!isEasySession(s) && !isRecoverySession(s)) {
      errors.push(`${label}: the day after the long run (${next}) is the absorption run or cross-training, easy; "${s.title}" is ${s.session_type.replace('_', ' ')}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Days: up to 2 sessions a day; strength as its own session; easy days stay easy
// ---------------------------------------------------------------------------

const isStrengthSession = (s: Session) => s.parts.some((p) => p.format === 'Strength');
const EASY_RUN_TYPES = ['easy', 'recovery'];

function checkDays(week: BlockWeek, label: string, ctx: BlockContext, errors: string[]) {
  for (const day of DAYS) {
    const sessions = week.sessions.filter((s) => s.day === day);
    if (sessions.length === 0) continue;
    if (sessions.length > 2) {
      errors.push(`${label}: ${day} has ${sessions.length} sessions; at most 2 a day.`);
      continue;
    }
    if (sessions.length === 1) {
      if (sessions[0].order_in_day !== 1) errors.push(`${label}: "${sessions[0].title}" is the only session on ${day}, so order_in_day is 1.`);
      continue;
    }
    const [first, second] = [...sessions].sort((a, b) => a.order_in_day - b.order_in_day);
    if (first.order_in_day !== 1 || second.order_in_day !== 2) {
      errors.push(`${label}: the two sessions on ${day} need order_in_day 1 and 2.`);
    } else if (ctx.canDouble === 'no' && !(isStrengthSession(second) && !isStrengthSession(first))) {
      errors.push(`${label}: the athlete can't train twice a day, so the only double day is a strength session straight after the run (order_in_day 2); ${day} has "${first.title}" and "${second.title}".`);
    }
  }
}

const isRecoverySession = (s: Session) =>
  s.session_type === 'recovery' || (s.parts.length > 0 && s.parts.every((p) => p.format === 'Run' && p.run_type === 'recovery'));
// The key session (also the week's main aerobic run before intervals start) is never an easy day.
const isEasySession = (s: Session) => !s.key_session && (
  s.session_type === 'easy_steady' || (s.parts.length > 0 && s.parts.every((p) => p.format === 'Run' && EASY_RUN_TYPES.includes(p.run_type ?? ''))));
const isStrengthOnly = (s: Session) =>
  s.parts.some((p) => p.format === 'Strength') && s.parts.every((p) => p.format === 'Strength' || p.format === 'Mobility');

/**
 * Strength and circuits go on hard days. Recovery days never get them. Easy days
 * (an easy session, easy Run or the athlete's own easy run) get no circuits, and
 * strength only when the athlete chose more strength sessions than there are hard days.
 */
function checkEasyDays(week: BlockWeek, label: string, ctx: BlockContext, strengthCount: number, errors: string[]) {
  const hardDays = new Set<string>(week.sessions.filter((s) => !isRecoverySession(s) && !isEasySession(s) && !isStrengthOnly(s)).map((s) => s.day));
  if (ctx.running === 'own_plan') for (const r of ctx.ownRuns) if (r.intensity === 'hard') hardDays.add(r.day);
  for (const o of ctx.ownStrength ?? []) if (o.intensity === 'hard') for (const d of o.days) hardDays.add(d);
  const extrasOnEasyDays = strengthCount > hardDays.size;
  for (const day of DAYS) {
    const sessions = week.sessions.filter((s) => s.day === day);
    const recovery = sessions.find(isRecoverySession);
    const easy = sessions.find(isEasySession);
    const ownEasy = ctx.running === 'own_plan' && ctx.ownRuns.some((r) => r.day === day && r.intensity === 'easy');
    if (!recovery && !easy && !ownEasy) continue;
    const kind = recovery ? `a recovery day ("${recovery.title}")` : `an easy day (${easy ? `"${easy.title}"` : 'their own easy run'})`;
    for (const s of sessions) {
      for (const p of s.parts) {
        if (p.format === 'Circuit' || (p.format === 'Strength' && (recovery || !extrasOnEasyDays))) {
          errors.push(`${label}: "${s.title}" has a ${p.format} part on ${day}, ${kind}; ${p.format === 'Strength' && !recovery ? `strength goes on hard days (${hardDays.size} this week, for ${strengthCount} strength sessions)` : 'strength and circuits go on hard days'}.`);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Weekly mix, own run plan spacing, long runs
// ---------------------------------------------------------------------------

const HYBRID_FORMATS = ['Station', 'Compromised', 'CompromisedRun', 'RaceSim', 'Circuit', 'HIIT', 'Tabata', 'AMRAP', 'EMOM', 'ForTime', 'Aerobic'];
export type Need = 'key run' | 'easy or long run' | 'run' | 'strength' | 'hybrid or station';

export function serves(s: Session): Set<Need> {
  const out = new Set<Need>();
  for (const p of s.parts) {
    if (p.format === 'Run') {
      out.add('run');
      if (p.run_type === 'key') out.add('key run');
      if (p.run_type === 'easy' || p.run_type === 'long' || p.run_type === 'recovery') out.add('easy or long run');
    }
    if (p.format === 'Strength') out.add('strength');
    if (HYBRID_FORMATS.includes(p.format)) out.add('hybrid or station');
  }
  return out;
}

/** Can each need be met by a different session? (small backtracking match) */
export function matchable(needs: Need[], sessions: Set<Need>[], used = new Set<number>()): boolean {
  if (needs.length === 0) return true;
  const [first, ...rest] = needs;
  for (let i = 0; i < sessions.length; i++) {
    if (used.has(i) || !sessions[i].has(first)) continue;
    used.add(i);
    if (matchable(rest, sessions, used)) return true;
    used.delete(i);
  }
  return false;
}

/** Core sessions a normal week needs so the athlete's strength sessions fit beside the running and hybrid needs. */
export function coreSessionsForStrength(running: RunningMode, daysAvailable: number, strengthPref: number, beginner = false, homeOffFeet = false): number {
  // Home beginner off-feet: the key session plus the strength sessions; other days are rest or easy walks.
  const others = homeOffFeet ? 1 : beginner ? Math.max(daysAvailable, weeklyOthers(running, 99).length) : weeklyOthers(running, 99).length;
  return Math.min(daysAvailable * 2, others + strengthPref);
}

/** The week's running and hybrid needs (strength comes on top; see strengthTarget). */
export function weeklyOthers(running: RunningMode, coreSessions: number): Need[] {
  return running === 'programmed'
    ? coreSessions >= 4 ? ['key run', 'easy or long run', 'hybrid or station']
      : coreSessions === 3 ? ['key run', 'hybrid or station']
      : coreSessions >= 1 ? ['key run'] : []
    : coreSessions >= 2 ? ['hybrid or station'] : [];
}

/** What the week's core sessions must include, each need in a different session. */
export function weeklyNeeds(running: RunningMode, coreSessions: number, strengthSessions: number): Need[] {
  const others = weeklyOthers(running, coreSessions);
  const keyRun = others.filter((n) => n === 'key run');
  return [...keyRun, ...Array<Need>(strengthSessions).fill('strength'), ...others.filter((n) => n !== 'key run')];
}

function checkWeeklyMix(core: Session[], label: string, ctx: BlockContext, strengthCount: number, errors: string[]) {
  const needs = weeklyNeeds(ctx.running, core.length, strengthCount);
  if (needs.length && !matchable(needs, core.map(serves))) {
    errors.push(`${label}: with ${core.length} core sessions the week needs, each in a different core session: ${needs.join(', ')}.`);
  }
}

const HEAVY_LOWER = ['Squat', 'Hinge', 'Lunge / single-leg'];

/**
 * Repeats follow athlete.repeat_preference (09 §4). Only quality sessions are checked;
 * easy, recovery, optional and maintain sessions may always repeat.
 * - always_new (default): never repeat last week's session unchanged.
 * - same_two_weeks: the same session two weeks in a row, then progress (not three).
 * - alternate: A / B / A / B: not last week's session, and progressed from two weeks ago.
 */
function checkRepeats(week: BlockWeek, previous: BlockWeek, twoBack: BlockWeek | undefined, label: string, ctx: BlockContext, errors: string[]) {
  const pref = ctx.repeatPreference ?? 'always_new';
  const last = new Set(previous.sessions.map(sessionSignature));
  const before = new Set(twoBack?.sessions.map(sessionSignature) ?? []);
  for (const s of week.sessions.filter((x) => !x.optional && x.build_or_maintain !== 'maintain' && !isEasySession(x) && !isRecoverySession(x))) {
    const sig = sessionSignature(s);
    if (pref === 'same_two_weeks') {
      if (last.has(sig) && before.has(sig)) errors.push(`${label}: "${s.title}" has been the same for two weeks; progress it now (the athlete repeats a session two weeks in a row, then progresses).`);
    } else if (pref === 'alternate') {
      if (last.has(sig)) errors.push(`${label}: "${s.title}" repeats last week's session; the athlete alternates sessions (A / B / A / B).`);
      else if (before.has(sig)) errors.push(`${label}: "${s.title}" repeats the session from two weeks ago unchanged; progress it on its repeat.`);
    } else if (last.has(sig)) {
      errors.push(`${label}: "${s.title}" repeats a session from the week before unchanged; progress load, sets, reps or density.`);
    }
  }
}

export interface RaceSims {
  choice: 'plan_for_me' | 'my_plan' | 'none';
  type?: 'full' | 'half' | 'other' | null;
  frequency?: 'weekly' | 'every_2nd_week' | 'monthly' | 'once_before_race' | null;
  other?: string | null;
  preferred_day?: string | null;
}

const isSim = (s: Session) => s.parts.some((p) => p.format === 'RaceSim');

/**
 * Race simulations follow athlete.race_sims (onboarding 2d).
 * - plan_for_me: full simulations at most every 3–4 weeks (a warning, not a failure).
 * - my_plan: the athlete's frequency is followed, as the week's key session.
 * - none: no simulations.
 * Always: an easy or recovery day (or rest) after a full simulation; none in race week.
 */
function checkRaceSims(block: Block, ctx: BlockContext, errors: string[]) {
  const rs = ctx.raceSims ?? { choice: 'plan_for_me' };
  const full = rs.choice !== 'my_plan' || (rs.type ?? 'full') === 'full';
  const simWeeks: number[] = [];
  for (const w of block.weeks) {
    const sims = w.sessions.filter(isSim);
    if (!sims.length) continue;
    const sim = sims[0];
    if (rs.choice === 'none') errors.push(`Week ${w.week}: "${sim.title}" is a race simulation; the athlete chose no simulations.`);
    if (w.week === ctx.finalWeek && full) errors.push(`Week ${w.week}: no full race simulation in race week (the last one 7–10+ days before the race).`);
    if (rs.choice === 'my_plan' && !sim.key_session) errors.push(`Week ${w.week}: "${sim.title}" is the athlete's own race simulation, so it is the week's key session.`);
    if (full) {
      const next = DAYS[DAYS.indexOf(sim.day) + 1];
      for (const s of w.sessions.filter((x) => next && x.day === next)) {
        if (!isEasySession(s) && !isRecoverySession(s)) errors.push(`Week ${w.week}: "${s.title}" on ${next} is the day after a full race simulation; make it an easy or recovery day.`);
      }
    }
    simWeeks.push(w.week);
  }
  if (rs.choice === 'plan_for_me') {
    for (let k = 1; k < simWeeks.length; k++) {
      if (simWeeks[k] - simWeeks[k - 1] < 3) ctx.warnings?.push(`Week ${simWeeks[k]}: full race simulations are best at most every 3–4 weeks; the last was week ${simWeeks[k - 1]}.`);
    }
  }
  if (rs.choice === 'my_plan' && rs.frequency) {
    const weeks = block.weeks.map((w) => w.week).filter((n) => n !== ctx.finalWeek);
    const has = (n: number) => simWeeks.includes(n);
    if (rs.frequency === 'weekly') {
      for (const n of weeks.filter((x) => !has(x))) errors.push(`Week ${n}: the athlete does a race simulation every week (their plan); add it as the key session.`);
    } else if (rs.frequency === 'every_2nd_week') {
      for (let k = 1; k < weeks.length; k++) {
        if (!has(weeks[k]) && !has(weeks[k - 1])) errors.push(`Weeks ${weeks[k - 1]}–${weeks[k]}: the athlete does a race simulation every 2nd week (their plan); one of these weeks needs it.`);
      }
    } else if (rs.frequency === 'monthly' && weeks.length >= 3 && !weeks.some(has)) {
      errors.push(`Weeks ${weeks[0]}–${weeks.at(-1)}: the athlete does a race simulation once a month / at the end of each block (their plan); add one.`);
    } else if (rs.frequency === 'once_before_race') {
      const window = [ctx.finalWeek - 2, ctx.finalWeek - 1].filter((n) => weeks.includes(n));
      if (window.length === 2 && !window.some(has)) errors.push(`Weeks ${window.join('–')}: the athlete does one race simulation before the race (their plan), 7–10+ days out.`);
    }
  }
}

/** Heavy lower-body strength, loaded lunges (stations, race work) or sled work anywhere in the session. */
function heavyLower(s: Session, ctx: BlockContext): string | null {
  for (const p of s.parts) {
    for (const it of p.items) {
      const e = it.exercise_id ? ctx.candidates.exercises.get(it.exercise_id) : undefined;
      if (!e) continue;
      if (e.movement_pattern === 'Sled') return 'sled';
      if (p.format === 'Strength' && HEAVY_LOWER.includes(e.movement_pattern)) return 'heavy lower-body';
      if (e.movement_pattern === 'Lunge / single-leg' && ['Station', 'Compromised', 'RaceSim'].includes(p.format)) return 'lunge';
    }
  }
  return null;
}

/**
 * Interference (all athletes): no heavy lower-body, lunge or sled work the day before
 * a key run or the long run (or the athlete's own hard run), and never as a second
 * (PM) session two days before. The fix is upper body + core, not moving the session.
 */
function checkInterference(week: BlockWeek, label: string, ctx: BlockContext, errors: string[]) {
  const targets: { day: number; what: string }[] = [];
  for (const s of week.sessions) {
    for (const p of s.parts) {
      if (p.format === 'Run' && (p.run_type === 'key' || p.run_type === 'long')) {
        targets.push({ day: DAYS.indexOf(s.day), what: `the ${p.run_type === 'key' ? 'key' : 'long'} run on ${s.day}` });
      }
    }
  }
  if (ctx.running === 'own_plan') {
    for (const r of ctx.ownRuns.filter((x) => x.intensity === 'hard')) {
      targets.push({ day: DAYS.indexOf(r.day as (typeof DAYS)[number]), what: `the athlete's hard run on ${r.day}` });
    }
  }
  const flagged = new Set<Session>();
  for (const t of targets) {
    for (const s of week.sessions) {
      if (flagged.has(s)) continue;
      const gap = t.day - DAYS.indexOf(s.day);
      if (gap !== 1 && !(gap === 2 && s.order_in_day === 2)) continue;
      const kind = heavyLower(s, ctx);
      if (!kind) continue;
      flagged.add(s);
      errors.push(`${label}: "${s.title}" on ${s.day}${gap === 2 ? ' (second session)' : ''} has ${kind} work ${gap === 1 ? 'the day before' : 'two days before'} ${t.what}; make it upper body + core instead of moving it.`);
    }
  }
}

/**
 * Long runs: minutes within the week's stage (lib/longruns.ts) and at most 90 min
 * (120 for advanced runners); base effort RPE 5–6 (6–7 advanced), with race-effort
 * segments up to RPE 8.5 (9 for advanced: slightly faster than race effort).
 */
function checkLongRunTargets(block: Block, ctx: BlockContext, errors: string[]) {
  const max = ctx.advancedRunner ? 120 : 90;
  const base: [number, number] = ctx.advancedRunner ? [5, 7] : [5, 6];
  const top = ctx.beginnerRunner ? base[1] : ctx.advancedRunner ? 9 : 8.5; // long-run efforts never for beginners
  for (const week of block.weeks) {
    const target = ctx.longRunPlan?.get(week.week);
    for (const s of week.sessions) {
      for (const p of s.parts.filter((x) => x.format === 'Run' && x.run_type === 'long')) {
        const where = `Week ${week.week}, "${s.title}"`;
        if (p.minutes > max) errors.push(`${where}: the long run is ${p.minutes} min; at most ${max} min${ctx.advancedRunner ? '' : ' (90–120 min is for advanced runners)'}.`);
        if (target && (p.minutes < target.minutes[0] - 5 || p.minutes > target.minutes[1] + 5)) {
          errors.push(`${where}: this week's long run is ${target.label}, ${target.minutes[0]}–${target.minutes[1]} min; it is ${p.minutes} min.`);
        }
        const ranges = p.items.flatMap((it) => [...it.dose.matchAll(RPE_RE)].map((m) => [Number(m[1]), Number(m[2] ?? m[1])] as [number, number]));
        if (!ranges.length) {
          errors.push(`${where}: give the long run's effort as RPE (${ctx.advancedRunner ? 'RPE 6–7' : 'RPE 5–6 · Easy'}).`);
          continue;
        }
        const [lo, hi] = ranges[0];
        if (lo < base[0] || hi > base[1]) {
          errors.push(`${where}: the long run's base effort is ${ctx.advancedRunner ? 'RPE 6–7 for advanced runners' : 'RPE 5–6 · Easy'}; it says RPE ${lo === hi ? lo : `${lo}–${hi}`}.`);
        }
        if (ranges.some(([, h]) => h > top)) errors.push(`${where}: ${ctx.beginnerRunner ? 'no efforts in a beginner\'s long run; keep it easy' : `long-run segments go up to RPE ${top}`}.`);
      }
    }
  }
}

/** Programmed running: the first long run starts at or below the longest recent run; then +10 min at most. */
function checkLongRuns(block: Block, ctx: BlockContext, errors: string[]) {
  let last = ctx.previousLongRunMin;
  for (const week of block.weeks) {
    for (const s of week.sessions) {
      for (const p of s.parts.filter((x) => x.format === 'Run' && x.run_type === 'long')) {
        const cap = last !== null ? last + 10 : ctx.longestRunMin !== null ? ctx.longestRunMin + 5 : null;
        if (cap !== null && p.minutes > cap) {
          errors.push(`Week ${week.week}, "${s.title}": the long run is ${p.minutes} min; it can be at most ${cap} min (${last !== null ? 'previous long run + 10' : 'longest run in the last 3 weeks + 5'}).`);
        }
        last = p.minutes;
      }
    }
  }
}

/**
 * Strength count and placement for the week.
 * - Core strength sessions = the outline's strength_sessions.
 * - Taper and race week: maintain; race week's at least 5 days before the race.
 * - with_hard_sessions: on hard days first, after the day's first (hard) session.
 * - own_days: not the day after a key session, and followed by an easy or rest day
 *   (when there are enough days without hard sessions).
 */
function checkStrengthWeek(
  week: BlockWeek, label: string, ctx: BlockContext, strengthCount: number, optionalCount: number, maintainOnly: boolean, errors: string[],
) {
  const strength = week.sessions.filter((s) => !s.optional && isStrengthSession(s));
  const optional = week.sessions.filter((s) => s.optional && isStrengthSession(s));
  if (strength.length !== strengthCount) {
    errors.push(`${label}: ${strengthCount} core strength session${strengthCount === 1 ? '' : 's'} this week (the outline's strength_sessions); the block has ${strength.length}.`);
  }
  if (optionalCount && optional.length !== optionalCount) {
    errors.push(`${label}: a deload week has 1 core strength session plus 1 optional strength session (optional: true); the block has ${optional.length} optional.`);
  }
  if (maintainOnly) {
    for (const s of [...strength, ...optional].filter((x) => x.build_or_maintain !== 'maintain')) {
      errors.push(`${label}: "${s.title}": strength in deload, taper and race weeks is maintain (same load and intent, 1–2 working sets).`);
    }
  }
  if (week.week === ctx.finalWeek) {
    const allowed = raceWeekStrengthDays(ctx.raceDay);
    for (const s of strength.filter((x) => !allowed.includes(x.day))) {
      errors.push(`${label}: "${s.title}" is on ${s.day}; race-week strength is early in the week, at least 5 days before the race (${allowed.join(' or ') || 'no day fits'}).`);
    }
    return;
  }

  const hard = (s: Session) => !isRecoverySession(s) && !isEasySession(s) && !isStrengthOnly(s);
  const ownHard = (day: string) => ctx.running === 'own_plan' && ctx.ownRuns.some((r) => r.day === day && r.intensity === 'hard');
  // Placement looks at core sessions: optional ones may not happen.
  const on = (day: string) => week.sessions.filter((s) => s.day === day && !s.optional);
  const hardDay = (day: string) => on(day).some(hard) || ownHard(day);

  if (ctx.homeOffFeet) {
    checkHomeOffFeetWeek(week, label, ctx, strength, errors);
    return;
  }
  if (ctx.strengthPlacement === 'with_hard_sessions' || ctx.beginner) {
    for (const s of strength) {
      if (!hardDay(s.day)) continue;
      const first = on(s.day).find((x) => x !== s && hard(x));
      if (first && s.order_in_day !== 2) {
        errors.push(`${label}: "${s.title}" goes after "${first.title}" on ${s.day} (run or hard session first, then strength: order_in_day 2).`);
      }
    }
    // Hard days with room for a strength session, while strength sits elsewhere.
    const free = ctx.trainingDays.filter((d) => hardDay(d) && !on(d).some(isStrengthSession) && week.sessions.filter((s) => s.day === d).length < 2);
    const elsewhere = strength.filter((s) => !hardDay(s.day) && !s.key_session); // a key strength session stands on its own
    if (free.length && elsewhere.length) {
      errors.push(`${label}: strength goes on hard days first (as the day's second session); ${free.join(', ')} ${free.length === 1 ? 'has' : 'have'} room, but "${elsewhere[0].title}" is on ${elsewhere[0].day}.`);
    } else if (ctx.beginner && elsewhere.length && strength.length <= ctx.trainingDays.filter(hardDay).length) {
      errors.push(`${label}: for beginners, strength is the second session on a quality day, leaving the other training days for runs or conditioning; "${elsewhere[0].title}" is on its own on ${elsewhere[0].day}.`);
    }
    return;
  }

  // own_days: only enforced while there are enough days without a hard session.
  const quietDays = ctx.trainingDays.filter((d) => !on(d).some(hard) && !ownHard(d));
  if (strength.length > quietDays.length) return;
  const keyOn = (day: string) => on(day).some((s) => s.key_session) || ownHard(day);
  for (const s of strength) {
    const i = DAYS.indexOf(s.day);
    if (i > 0 && keyOn(DAYS[i - 1])) errors.push(`${label}: "${s.title}" is the day after a key session (${DAYS[i - 1]}); strength days are hard days, not the day after a key session.`);
    if (i < 6 && hardDay(DAYS[i + 1])) errors.push(`${label}: "${s.title}" on ${s.day} is followed by a hard day (${DAYS[i + 1]}); follow a strength day with an easy or recovery day.`);
    if (on(s.day).some(hard)) errors.push(`${label}: "${s.title}" shares ${s.day} with a hard session; with strength on its own days, give it a day without one.`);
  }
}

// "3 × 8", "3 sets (2–3) × 6–8", "2 working sets x 10": planned sets, optional set range, reps or rep range.
const STRENGTH_DOSE_RE = /(\d+)\s*(?:working\s+)?(?:sets?\s*)?(?:\((\d+)\s*[-–]\s*(\d+)\)\s*)?[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?(?!\s*(?:s|sec|secs|seconds|min|mins|minutes|m|km|cal|cals)\b)/i;
const STRENGTH_REPS: [number, number] = [6, 10];
const STRENGTH_GROUPS_MAX = 4;

/** Strength: its own session (no Run parts), 2–3 working sets (1–2 to maintain), 6–10 reps, no RPE number, at most 4 exercise groups. */
function checkStrength(s: Session, where: string, deload: boolean, errors: string[]) {
  const strengthParts = s.parts.filter((p) => p.format === 'Strength');
  if (strengthParts.length === 0) return;
  if (s.parts.some((p) => p.format === 'Run')) {
    errors.push(`${where}: strength is its own session, never a part inside a run session; make it a separate session (order_in_day 2 after the run).`);
  }
  // Template slots pair into supersets (A1/A2), so a group is up to 2 items.
  const groups = strengthParts.reduce((n, p) => n + Math.ceil(p.items.length / 2), 0);
  if (groups > STRENGTH_GROUPS_MAX) errors.push(`${where}: at most ${STRENGTH_GROUPS_MAX} exercise groups in a strength session; it has ${groups}.`);
  const [minSets, maxSets] = s.build_or_maintain === 'maintain' ? [1, 2] : deload ? [1, 3] : [2, 3];
  strengthParts.forEach((p) => p.items.forEach((item, k) => {
    const at = `${where}, ${p.format} item ${k + 1}`;
    if (/\brpe\s*\d/i.test(item.dose)) errors.push(`${at}: strength sets show intent ("hard, with intent: finish with 1–2 good reps left"), not an RPE number ("${item.dose}").`);
    const m = STRENGTH_DOSE_RE.exec(item.dose);
    if (!m) return; // timed or distance items (carries, holds) are not rep sets
    const sets = [Number(m[1]), ...(m[2] ? [Number(m[2]), Number(m[3])] : [])];
    if (sets.some((n) => n < minSets || n > maxSets)) {
      errors.push(`${at}: ${minSets}–${maxSets} working sets${s.build_or_maintain === 'maintain' ? ' to maintain' : ''} (ramp-up sets not counted); got "${item.dose}".`);
    }
    const reps = [Number(m[4]), ...(m[5] ? [Number(m[5])] : [])];
    if (reps.some((n) => n < STRENGTH_REPS[0] || n > STRENGTH_REPS[1])) {
      errors.push(`${at}: strength sets are ${STRENGTH_REPS[0]}–${STRENGTH_REPS[1]} reps; got "${item.dose}".`);
    }
  }));
}

function validateSession(s: Session, where: string, deload: boolean, final: boolean, ctx: BlockContext, errors: string[]) {
  if (s.optional && !s.slot) errors.push(`${where}: optional sessions need a slot key.`);
  if (!s.optional && s.slot) errors.push(`${where}: core sessions have slot null.`);
  if (s.parts.length < 1 || s.parts.length > 3) errors.push(`${where}: a session has 1 to 3 parts.`);
  checkTitle(s, where, ctx, errors);
  if (!s.progression.change.trim()) errors.push(`${where}: say in a few words what changed versus the last similar session (progression.change).`);
  // Cross-training = an Aerobic or HIIT part done wholly on ergs. Alternatives are
  // only required when the athlete has another erg to switch to.
  const isErgItem = (it: SessionPart['items'][number]) => {
    const e = it.exercise_id ? ctx.candidates.exercises.get(it.exercise_id) : undefined;
    return !!e && isErg(e);
  };
  const crossTraining = s.parts.some((p) => (p.format === 'Aerobic' || p.format === 'HIIT') && p.items.length > 0 && p.items.every(isErgItem));
  const ergCount = [...ctx.candidates.exercises.values()].filter(isErg).length;
  if (crossTraining && ergCount >= 2 && s.alternatives.length === 0) {
    errors.push(`${where}: cross-training sessions list alternatives from the athlete's equipment.`);
  }

  checkStrength(s, where, deload, errors);

  const tol = ctx.settings.minutesTolerance;
  const short = shortStrengthTemplate(s, final, ctx.candidates);
  if (s.order_in_day === 2 && isStrengthOnly(s) && !short) {
    errors.push(`${where}: a strength session that is the day's second session is one 30- or 45-min Strength template (its own warm-up and cool-down), not the usual ${ctx.minutesPerSession} min.`);
  }
  if (short) {
    s.parts.forEach((part, k) => validatePart(part, k, `${where}, part ${k + 1} (${part.format})`, ctx, errors));
    return;
  }
  const total = ctx.frame.warmup_min + ctx.frame.cooldown_min + s.parts.reduce((m, p) => m + p.minutes, 0);
  const longRun = s.parts.some((p) => p.format === 'Run' && p.run_type === 'long');
  // With the skeleton, each session has its slot's minutes (short shakeouts, race-week and taper sessions).
  if (s.target_min !== undefined && !longRun) {
    if (Math.abs(total - s.target_min) > tol) {
      errors.push(`${where}: with the ${ctx.frame.warmup_min} min warm-up and ${ctx.frame.cooldown_min} min cool-down it lasts ${total} min; this session is ${s.target_min} min (±${tol}).`);
    }
    s.parts.forEach((part, k) => validatePart(part, k, `${where}, part ${k + 1} (${part.format})`, ctx, errors));
    return;
  }
  const minTotal = deload ? Math.floor(ctx.minutesPerSession * ctx.settings.deloadSessionMinRatio) : ctx.minutesPerSession - tol;
  // A long run may make its session longer than usual, up to LONG_RUN_SESSION_MAX.
  const maxTotal = longRun ? Math.max(ctx.minutesPerSession + tol, LONG_RUN_SESSION_MAX) : ctx.minutesPerSession + tol;
  if (total < minTotal || total > maxTotal) {
    errors.push(`${where}: with the ${ctx.frame.warmup_min} min warm-up and ${ctx.frame.cooldown_min} min cool-down it lasts ${total} min; sessions must be ${ctx.minutesPerSession} min (±${tol})${deload ? `, or down to ${minTotal} min in a deload week` : ''}.`);
  }

  s.parts.forEach((part, k) => validatePart(part, k, `${where}, part ${k + 1} (${part.format})`, ctx, errors));
}

function validatePart(part: SessionPart, index: number, where: string, ctx: BlockContext, errors: string[]) {
  const f = ctx.candidates.formats.get(part.format);
  if (!f) {
    errors.push(`${where}: unknown format.`);
    return;
  }
  if (part.format === 'Run' && ctx.running !== 'programmed') {
    errors.push(`${where}: no Run parts; the athlete didn't choose "Program my running".`);
  }
  if (!ctx.availableFormats.has(part.format)) {
    errors.push(`${where}: ${part.format} isn't available for this athlete; use one of: ${[...ctx.availableFormats].join(', ')}.`);
  }
  if (part.format === 'Run' ? !part.run_type : part.run_type) {
    errors.push(`${where}: ${part.format === 'Run' ? 'Run parts need run_type (key, easy, long or recovery)' : 'run_type is only for Run parts'}.`);
  }
  const rules = f.rules;
  const exercises: (Exercise | undefined)[] = [];

  // Items: known ids, the athlete's own race only, and the coach's unit rules.
  part.items.forEach((item, k) => {
    const at = `${where}, item ${k + 1}`;
    if ((item.exercise_id === null) === (item.race_session_id === null)) {
      errors.push(`${at}: set exactly one of exercise_id or race_session_id.`);
      exercises.push(undefined);
      return;
    }
    const exercise = item.exercise_id !== null ? ctx.candidates.exercises.get(item.exercise_id) : undefined;
    if (item.exercise_id !== null && !exercise) errors.push(`${at}: ${item.exercise_id} is not in the candidate exercise list.`);
    if (item.race_session_id !== null) {
      if (!ctx.candidates.raceSessions.has(item.race_session_id)) errors.push(`${at}: ${item.race_session_id} is not in the candidate race session list.`);
      if (!['RaceSim', 'Compromised', 'Station'].includes(part.format)) errors.push(`${at}: race sessions only go in RaceSim, Compromised or Station parts.`);
    }
    const text = `${item.dose} ${item.cue ?? ''}`;
    if (FORBIDDEN_UNITS_RE.test(text) || (PACE_RE.test(text) && !(ctx.ownRacePace && /\bRPE\b/i.test(text)))) {
      errors.push(`${at}: write intensity as RPE or feel; never kg, watts, paces or zones ("${item.dose}")${ctx.ownRacePace ? '; the athlete\'s own pace may appear only beside the RPE' : ''}.`);
    }
    // "No running" is off-feet only: run segments become the athlete's preferred erg or bike.
    if (exercise && isRunning(exercise) && ctx.running === 'none') {
      errors.push(`${at}: the athlete chose no running (off-feet only); replace the run segment with their preferred erg or bike.`);
    }
    // Off-feet choices (onboarding Q2c): erg and bike sessions only if chosen (simulations may swap runs for either).
    if (exercise && ctx.running === 'none' && ctx.offFeetIncludes && !['RaceSim', 'CompromisedRun'].includes(part.format)) {
      if (isBike(exercise) && !ctx.offFeetIncludes.includes('bike')) errors.push(`${at}: the athlete didn't choose bike sessions.`);
      if (isRowOrSki(exercise) && !ctx.offFeetIncludes.includes('erg')) errors.push(`${at}: the athlete didn't choose erg sessions (SkiErg / row).`);
    }
    // Dose kind by format.
    if (f.dose_kind === 'time' && REPS_RE.test(item.dose)) errors.push(`${at}: ${part.format} is timed, so the dose is time only, no reps ("${item.dose}").`);
    if (f.dose_kind === 'reps' && !/\d/.test(item.dose)) errors.push(`${at}: ${part.format} is dosed in reps (or distance); give a number.`);
    if (f.dose_kind === 'sets_reps_load' && (!SETS_REPS_RE.test(item.dose) || !LOAD_BY_FEEL_RE.test(item.dose))) {
      errors.push(`${at}: strength is dosed as working sets × reps plus the intent (e.g. "3 sets (2–3) × 6–8, hard with intent: finish with 1–2 good reps left"); got "${item.dose}".`);
    }
    if (f.dose_kind === 'foot_contacts' && !(item.foot_contacts && item.foot_contacts > 0)) errors.push(`${at}: plyometric drills need foot_contacts.`);
    // Running only in race simulations and compromised parts.
    if (exercise && isRunning(exercise)) {
      if (f.running === 'none') {
        errors.push(`${at}: no running in ${part.format} parts; running goes in ${ctx.running === 'programmed' ? 'Run parts, ' : ''}race simulations and compromised parts.`);
      }
      if (f.running === 'sim' && ctx.candidates.race.run_distance_m && item.run_distance_m !== ctx.candidates.race.run_distance_m) {
        errors.push(`${at}: run segments in a ${ctx.candidates.race.label} simulation are ${ctx.candidates.race.run_distance_m} m (run_distance_m).`);
      }
      if (f.running === 'capped' && !(item.run_minutes && item.run_minutes > 0)) errors.push(`${at}: give run_minutes for running in a compromised part.`);
    }
    exercises.push(exercise);
  });

  const count = part.items.length;
  const inRange = (r: [number, number] | null, n: number, what: string) => {
    if (r && (n < r[0] || n > r[1])) errors.push(`${where}: ${what} must be ${r[0]}–${r[1]}; it is ${n}.`);
  };

  // Templates only where the format needs one.
  if (f.needs_template) {
    const template = part.template_id ? ctx.candidates.templates.get(part.template_id) : undefined;
    if (!template) {
      errors.push(`${where}: ${part.format} parts need a template from the candidate list.`);
    } else {
      if (template.method !== part.format) errors.push(`${where}: template ${template.id} is a ${template.method} template.`);
      if (part.minutes !== partMinutes(template)) errors.push(`${where}: template ${template.id} runs ${partMinutes(template)} min; the part says ${part.minutes}.`);
      if (count !== template.slots.length) {
        errors.push(`${where}: template ${template.id} has ${template.slots.length} slots; the part has ${count} items.`);
      } else {
        template.slots.forEach((slot, k) => {
          const e = exercises[k];
          if (e && !slotMatches(slot, e)) {
            errors.push(`${where}, item ${k + 1}: ${e.id} (${e.movement_pattern}) doesn't fit slot "${slot.label}" [${slot.movement_patterns.join(', ')}]${slot.body_region ? ` (${slot.body_region})` : ''}.`);
          }
        });
      }
    }
  } else if (part.template_id && part.format !== 'CompromisedRun') {
    errors.push(`${where}: ${part.format} parts don't use a template; set template_id to null.`);
  }

  switch (part.format) {
    case 'Tabata': {
      const timing = ctx.timings.get(timingKey(part.format, part.minutes));
      const blocks = Number(timing?.blocks ?? 0);
      if (!timing || Math.abs(Number(timing.minutes) - part.minutes) > 0.5) {
        errors.push(`${where}: a Tabata part lasts whole blocks (4 min each plus rest between blocks); ${part.minutes} min doesn't fit. Use the Tabata timings listed.`);
      }
      exercises.forEach((e, k) => {
        if (e && !e.tabata_suitable) errors.push(`${where}, item ${k + 1}: ${e.id} is not Tabata-suitable (marked T).`);
      });
      for (let b = 1; b <= blocks; b++) {
        const inBlock = part.items.filter((it) => it.block === b).length;
        if (inBlock < 1 || inBlock > 2) errors.push(`${where}: Tabata block ${b} needs 1 exercise, or 2 alternating; it has ${inBlock}.`);
      }
      if (part.items.some((it) => !it.block || it.block > blocks)) errors.push(`${where}: give each Tabata item a block number from 1 to ${blocks}.`);
      break;
    }
    case 'HIIT':
      inRange(range(rules.exercises), count, 'the number of exercises');
      exercises.forEach((e, k) => {
        if (e && !(isErg(e) || isBodyweightOnly(e)) || (e && isRunning(e))) errors.push(`${where}, item ${k + 1}: HIIT uses ergs or bodyweight exercises.`);
      });
      break;
    case 'Aerobic':
      inRange(range(rules.exercises), count, 'the number of exercises');
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      exercises.forEach((e, k) => {
        if (e && !isErg(e) && !isWalking(e)) errors.push(`${where}, item ${k + 1}: steady aerobic parts use ergs or walking.`);
      });
      break;
    case 'AMRAP':
    case 'EMOM':
    case 'ForTime':
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      inRange(range(rules.exercises), count, 'the number of exercises');
      break;
    case 'Plyometric': {
      if (index !== 0) errors.push(`${where}: plyometrics go first in the session, straight after the warm-up.`);
      const level = ctx.timings.get(timingKey('Plyometric', part.minutes));
      inRange(range(level?.drills), count, 'the number of drills');
      const contacts = part.items.reduce((sum, it) => sum + (it.foot_contacts ?? 0), 0);
      inRange(range(level?.contacts), contacts, 'total foot contacts');
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      exercises.forEach((e, k) => {
        if (e && e.movement_pattern !== 'Plyometric' && !e.methods.includes('Plyometric')) errors.push(`${where}, item ${k + 1}: ${e.id} isn't a plyometric drill.`);
      });
      break;
    }
    case 'Compromised': {
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      const runMinutes = part.items.reduce((sum, it, k) => sum + (exercises[k] && isRunning(exercises[k]!) ? it.run_minutes ?? 0 : 0), 0);
      if (runMinutes > part.minutes * ctx.settings.runShareMax + 1e-9) {
        errors.push(`${where}: running is ${runMinutes} of ${part.minutes} min; the cap is ${Math.round(ctx.settings.runShareMax * 100)}%.`);
      }
      if (exercises.every((e) => !e || isRunning(e)) && !part.items.some((it) => it.race_session_id)) {
        errors.push(`${where}: a compromised part pairs running with station work.`);
      }
      break;
    }
    case 'CompromisedRun': {
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      const t = part.template_id ? ctx.candidates.compromised.get(part.template_id) : undefined;
      if (!t) {
        errors.push(`${where}: a compromised run uses one of the athlete's compromised sessions (template_id ${[...ctx.candidates.compromised.keys()].join(', ') || 'none available'}).`);
        break;
      }
      exercises.forEach((e, k) => {
        if (!e || isRunning(e) || (ctx.running === 'none' && isErg(e))) return; // runs, or the off-feet swap
        if (!t.stations.includes(e.movement_pattern)) {
          errors.push(`${where}, item ${k + 1}: ${t.id} (${t.name}) uses ${t.stations.length ? t.stations.join(', ') : 'running only'}; ${e.id} is ${e.movement_pattern}.`);
        }
      });
      break;
    }
    case 'Run':
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      exercises.forEach((e, k) => {
        if (e && !isRunning(e)) errors.push(`${where}, item ${k + 1}: Run parts only contain running exercises.`);
      });
      break;
    case 'RaceSim':
    case 'Station':
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      break;
  }
}
