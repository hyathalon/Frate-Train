import type { AthleteRow } from './auth.ts';
import { longRunPlan } from './longruns.ts';
import type { ProgramInputs } from './prompts.ts';
import { homeOffFeet, intervalIntroWeek, runningLevel } from './running.ts';
import { type BlockWeek, DAYS, type OutlineWeek, type PHASE_KINDS, type Session } from './schemas.ts';
import { daysBetween, weekdayOf } from './time.ts';

// The code skeleton (docs/coaching/skeleton-rules.md): the season's structure and
// every week's slots (day, AM/PM, type, minutes, strength focus), decided in code.
// Claude fills each slot with exercises, doses and wording.

export type Day = (typeof DAYS)[number];
type Phase = (typeof PHASE_KINDS)[number];

export type SlotKind =
  | 'key_run' // the main interval run, RPE 8+
  | 'aerobic_key' // the week's main aerobic run before intervals start (30 s efforts first)
  | 'quality_run' // a second interval run
  | 'long_run'
  | 'easy_run'
  | 'recovery_run'
  | 'sharpener' // race week: 15 min just slower than race effort
  | 'shakeout'
  | 'compromised'
  | 'race_sim'
  | 'strength'
  | 'hard_strength_key' // no programmed running: a hard strength session as the key session
  | 'off_feet_intervals' // erg / bike / bodyweight intervals at RPE 8+
  | 'workout' // a hard AMRAP / EMOM-type workout
  | 'off_feet_easy' // easy erg / bike / walk
  | 'walk';

export interface Slot {
  day: Day;
  order: 1 | 2;
  kind: SlotKind;
  key: boolean;
  optional: boolean;
  minutes: number; // the whole session (warm-up + parts + cool-down), or the long run's run minutes
  focus?: 'lower' | 'upper_core' | 'full'; // strength slots
  maintain?: boolean; // deload, taper and race-week strength
  efforts?: boolean; // a long run with race-effort segments (counts as quality)
  stage?: string; // long-run stage label
  slotKey?: string; // optional sessions' stable key
  note?: string;
}

export interface WeekPlan {
  week: number;
  phase: Phase;
  deload: boolean;
  lever: OutlineWeek['lever'];
  load: OutlineWeek['load'];
  final: boolean;
  sim: boolean; // a race simulation replaces the key session this week
  slots: Slot[];
  event?: { day: Day; priority: 'A' | 'B' | 'C'; type: string; name: string; controlled: boolean };
}

export interface SkeletonProfile {
  running: 'programmed' | 'own_plan' | 'none';
  trainingDays: Day[];
  runDays: Day[];
  keyDay: Day;
  longDay: Day | null;
  minutes: number;
  runsBase: number;
  strengthPref: number; // 0 when strength_choice is own or none
  placement: 'with_hard_sessions' | 'own_days';
  canDouble: 'no' | 'sometimes' | 'yes';
  level: AthleteRow['level'];
  beginnerRunner: boolean;
  homeOffFeet: boolean;
  offFeet: string[];
  ownHardDays: Day[]; // own hard runs and hard classes: hard days for placement and interference
  ownEasyDays: Day[];
  ownCompromisedClass: boolean; // an own Hyathlon-style class counts as the week's compromised session
  introWeek: number | null;
  longestRun: number | null;
  advanced: boolean;
  raceDay: Day;
  raceSims: NonNullable<ProgramInputs['race_sims']>;
  highVolume: boolean; // 4+ runs a week
  fixedDeload: boolean; // more than 5 h of running a week
}

const idx = (d: string) => DAYS.indexOf(d as Day);
const next = (d: Day, n = 1) => DAYS[(idx(d) + n + 7) % 7];
const SECOND_STRENGTH_MIN = (minutes: number) => (minutes >= 55 ? 45 : 30);

export function skeletonProfile(inputs: ProgramInputs, athlete: Pick<AthleteRow, 'level'>): SkeletonProfile {
  const running = inputs.running?.mode ?? 'none';
  const trainingDays = DAYS.filter((d) => inputs.training_days.includes(d));
  const noRun = inputs.no_run_days ?? [];
  const runDays = running === 'programmed' ? trainingDays.filter((d) => !noRun.includes(d)) : [];
  const level = runningLevel(inputs);
  const beginnerRunner = level === 'beginner_1' || level === 'beginner_2';
  const runsNow = inputs.runs_per_week ?? 3;
  const runsBase = running !== 'programmed' ? 0 : beginnerRunner ? Math.min(3, runDays.length) : Math.max(Math.min(2, runDays.length), Math.min(runDays.length, 6, runsNow));
  // Long-run day: the preferred one if it's a running day, else the last weekend running day, else the last running day.
  let longDay: Day | null = null;
  if (running === 'programmed' && runDays.length) {
    const pref = inputs.preferred_long_run_day as Day | null | undefined;
    longDay = pref && runDays.includes(pref) ? pref : [...runDays].reverse().find((d) => d === 'Sat' || d === 'Sun') ?? runDays[runDays.length - 1];
  }
  // Key day: the athlete's key day if it works; never the long-run day or the day before or after it.
  const keyPool = running === 'programmed' ? runDays : trainingDays;
  const blocked = (d: Day) => !!longDay && (d === longDay || d === next(longDay, -1) || d === next(longDay, 1));
  let keyDay = (keyPool.includes(inputs.key_session_day as Day) ? inputs.key_session_day : keyPool[Math.floor(keyPool.length / 2)]) as Day;
  if (blocked(keyDay)) keyDay = keyPool.find((d) => !blocked(d)) ?? keyPool.find((d) => d !== longDay) ?? keyDay;
  const own = inputs.own_strength ?? [];
  const ownHard = [
    ...(running === 'own_plan' ? (inputs.running.own_runs ?? []).filter((r) => r.intensity === 'hard').map((r) => r.day) : []),
    ...(inputs.strength_choice === 'own' ? own.filter((o) => o.intensity === 'hard').flatMap((o) => o.days) : []),
  ] as Day[];
  const ownEasy = running === 'own_plan' ? (inputs.running.own_runs ?? []).filter((r) => r.intensity === 'easy').map((r) => r.day as Day) : [];
  const runMinutesWeek = runsBase * inputs.minutes_per_session + Math.max(0, (inputs.longest_run_min ?? inputs.minutes_per_session) - inputs.minutes_per_session);
  return {
    running, trainingDays, runDays, keyDay, longDay,
    minutes: inputs.minutes_per_session,
    runsBase,
    strengthPref: (inputs.strength_choice ?? 'program') === 'program' ? (inputs.strength_sessions_pref ?? 2) : 0,
    placement: inputs.strength_placement ?? 'with_hard_sessions',
    canDouble: inputs.can_double ?? 'no',
    level: athlete.level,
    beginnerRunner,
    homeOffFeet: homeOffFeet(inputs, athlete.level),
    offFeet: inputs.off_feet_includes ?? [],
    ownHardDays: [...new Set(ownHard)],
    ownEasyDays: ownEasy,
    ownCompromisedClass: own.some((o) => /hyathlon|hyrox|compromised|hybrid/i.test(o.title)),
    introWeek: intervalIntroWeek(inputs),
    longestRun: inputs.longest_run_min ?? null,
    advanced: athlete.level === 'advanced',
    raceDay: weekdayOf(inputs.race_date) as Day,
    raceSims: inputs.race_sims ?? { choice: 'plan_for_me' },
    highVolume: runsBase >= 4,
    fixedDeload: runMinutesWeek > 300,
  };
}

// ---------------------------------------------------------------------------
// Season: phases, deloads, taper, events, levers. Counts come from the weeks.
// ---------------------------------------------------------------------------

export function seasonPlan(inputs: ProgramInputs, athlete: Pick<AthleteRow, 'level'>, totalWeeks: number, startDate: string): WeekPlan[] {
  const p = skeletonProfile(inputs, athlete);
  const taper = p.running === 'programmed' && p.highVolume ? 2 : 1; // Hyathlon: 8–14 days when 4+ runs a week, else ~7 days
  const before = totalWeeks - taper;
  const specific = before <= 3 ? before : Math.min(4, Math.max(1, Math.round(before / 3)));
  const build = before - specific <= 0 ? 0 : before <= 7 ? before - specific : Math.min(4, Math.round(before / 3));
  const phaseOf = (w: number): Phase => (w > before ? 'taper' : w > before - specific ? 'specific' : w > before - specific - build ? 'build' : 'base');

  // Other events in the program: their week and weekday.
  const events = new Map<number, NonNullable<WeekPlan['event']>>();
  for (const e of inputs.other_events ?? []) {
    const days = daysBetween(startDate, e.date);
    if (days < 0 || days >= totalWeeks * 7) continue;
    const week = Math.floor(days / 7) + 1;
    if (week === totalWeeks) continue;
    events.set(week, { day: weekdayOf(e.date) as Day, priority: e.event_priority, type: e.type, name: e.name, controlled: !!e.controlled });
  }

  const freeDay = p.trainingDays.length < 7 && !p.homeOffFeet;
  const plans: WeekPlan[] = [];
  let normal = 0;
  for (let w = 1; w <= totalWeeks; w++) {
    const phase = phaseOf(w);
    const final = w === totalWeeks;
    const event = events.get(w);
    const deload = p.fixedDeload && phase !== 'taper' && w % 4 === 0 && !final && !event;
    let lever: OutlineWeek['lever'];
    if (w === 1) lever = 'start';
    else if (deload || phase === 'taper' || final || (event && !event.controlled && event.priority !== 'C')) lever = 'deload';
    else {
      const cycle: OutlineWeek['lever'][] = freeDay ? ['volume', 'intensity', 'frequency'] : ['volume', 'intensity'];
      lever = cycle[normal++ % cycle.length];
    }
    const load: OutlineWeek['load'] = lever === 'deload' ? 'Low' : phase === 'specific' ? 'High' : 'Moderate';
    plans.push({ week: w, phase, deload, lever, load, final, sim: false, slots: [], event });
  }
  const sims = simWeeks(p, plans, totalWeeks);
  for (const x of plans) x.sim = sims.has(x.week);
  // Long-run stages (from the 4th long run, efforts for well-conditioned athletes).
  const outlineLike = plans.map((x) => ({ week: x.week, phase: x.phase, deload: x.deload || x.lever === 'deload', lever: x.lever }));
  const stages = p.running === 'programmed' && !p.beginnerRunner ? longRunPlan(p.longestRun, p.advanced, outlineLike, totalWeeks) : new Map();
  let longRuns = 0;
  let lastLong = p.longestRun;
  for (let i = 0; i < plans.length; i++) {
    const prev = i > 0 ? plans[i - 1] : undefined;
    plans[i].slots = weekSlots(p, plans[i], prev, () => {
      const stage = stages.get(plans[i].week);
      longRuns++;
      let minutes: number;
      if (stage) minutes = Math.round((stage.minutes[0] + stage.minutes[1]) / 2);
      else if (p.beginnerRunner) minutes = Math.min(60, Math.max(20, (lastLong ?? p.minutes) + 5));
      else minutes = Math.min(p.advanced ? 120 : 90, Math.max(p.minutes, (lastLong ?? p.minutes) + 5));
      if (!stage && lastLong !== null && minutes > lastLong + 10) minutes = lastLong + 10;
      if (plans[i].lever !== 'deload') lastLong = minutes;
      const efforts = !!stage && /LR [4-7]/.test(stage.label) && longRuns >= 4 && !p.beginnerRunner;
      return { minutes, stage: stage?.label, efforts };
    });
  }
  return plans;
}

/** The outline's structural fields for a week, from its slots. */
export function outlineCounts(plan: WeekPlan): Pick<OutlineWeek, 'core_sessions' | 'strength_sessions' | 'optional_sessions'> {
  const core = plan.slots.filter((s) => !s.optional);
  const isStrength = (s: Slot) => s.kind === 'strength' || s.kind === 'hard_strength_key';
  return { core_sessions: core.length, strength_sessions: core.filter(isStrength).length, optional_sessions: plan.slots.filter((s) => s.optional).length };
}

// ---------------------------------------------------------------------------
// A week's slots
// ---------------------------------------------------------------------------

const INTERVAL_KINDS: SlotKind[] = ['key_run', 'quality_run', 'compromised', 'race_sim', 'off_feet_intervals', 'workout', 'sharpener'];
export const isIntervalSlot = (s: Slot) => INTERVAL_KINDS.includes(s.kind) || (s.kind === 'long_run' && !!s.efforts);
const HARD_KINDS: SlotKind[] = [...INTERVAL_KINDS, 'aerobic_key', 'hard_strength_key'];

/** Race-simulation weeks per race_sims (decided over the whole season). */
function simWeeks(p: SkeletonProfile, plans: WeekPlan[], totalWeeks: number): Set<number> {
  const rs = p.raceSims;
  const out = new Set<number>();
  if (rs.choice === 'none' || (p.running === 'none' && !p.offFeet.includes('simulations'))) return out;
  const ok = (x: WeekPlan) => !x.final && !x.deload && !x.event && x.week <= totalWeeks - 1;
  if (rs.choice === 'plan_for_me') {
    // Full simulations every 4 weeks: the specific phase (any phase for no-running athletes), never in the taper.
    const pool = plans.filter((x) => ok(x) && x.phase !== 'taper' && (p.running === 'none' ? x.week >= 2 : x.phase === 'specific'));
    let last = -99;
    for (const x of pool) if (x.week - last >= 4) { out.add(x.week); last = x.week; }
    return out;
  }
  for (const x of plans.filter(ok)) {
    if (x.phase === 'taper' && rs.frequency !== 'once_before_race') continue;
    if (rs.frequency === 'weekly' || (rs.frequency === 'every_2nd_week' && x.week % 2 === 1) || (rs.frequency === 'monthly' && x.week % 4 === 3)) out.add(x.week);
  }
  if (rs.frequency === 'once_before_race') {
    const w = plans.filter(ok).at(-2) ?? plans.filter(ok).at(-1);
    if (w) out.add(w.week);
  }
  return out;
}

function weekSlots(
  p: SkeletonProfile,
  plan: WeekPlan,
  prev: WeekPlan | undefined,
  longRun: () => { minutes: number; stage?: string; efforts: boolean },
): Slot[] {
  const slots: Slot[] = [];
  const add = (s: Omit<Slot, 'order' | 'optional' | 'key'> & Partial<Pick<Slot, 'order' | 'optional' | 'key'>>) => {
    const slot: Slot = { order: 1, optional: false, key: false, ...s };
    slots.push(slot);
    return slot;
  };
  const used = (d: Day) => slots.filter((s) => s.day === d);
  const adjacentInterval = (d: Day) => [next(d, -1), next(d, 1)].some((x) => used(x).some(isIntervalSlot) || p.ownHardDays.includes(x));

  // Race week (goal race), and other A/B races (not controlled): sharpener, easy runs, short maintain strength.
  const raceWeek = plan.final || (plan.event && plan.event.priority !== 'C' && !plan.event.controlled);
  const raceDay = plan.final ? p.raceDay : plan.event?.day;
  if (raceWeek && raceDay) return raceWeekSlots(p, raceDay, add, used, !!plan.event && !plan.final);

  // Recovery after last week's race (A/B, or a C raced hard).
  let noQuality = false;
  if (prev?.event && !prev.event.controlled) {
    const t = prev.event.type;
    const shortRace = t === '10k_or_shorter';
    if (t === 'marathon_or_longer') noQuality = true;
    else if (shortRace) noQuality = !(p.advanced); // beginners/intermediates: no quality the week after
    else noQuality = idx(p.keyDay) + 7 - idx(prev.event.day) < 4; // Hyathlon / half: quality from day 4
  }
  const deload = plan.deload;
  const taperWeek = plan.phase === 'taper';
  const strengthTotal = p.strengthPref === 0 ? 0 : taperWeek ? 1 : deload ? 1 : p.strengthPref;
  const optionalStrength = deload && p.strengthPref >= 2 ? 1 : 0;

  // C race this week: it replaces the long run (or the key session), with the day before lighter.
  const cRace = plan.event && (plan.event.priority === 'C' || plan.event.controlled) ? plan.event : undefined;
  const sim = plan.sim;

  if (p.running === 'programmed') {
    const beforeIntervals = p.introWeek === null || plan.week < p.introWeek;
    const keyKind: SlotKind = sim ? 'race_sim' : beforeIntervals || noQuality ? 'aerobic_key' : 'key_run';
    const simDay = sim && p.raceSims.choice === 'my_plan' && p.raceSims.preferred_day && p.runDays.includes(p.raceSims.preferred_day as Day)
      ? p.raceSims.preferred_day as Day : p.keyDay;
    const cReplacesLong = !!cRace && !!p.longDay && (cRace.day === p.longDay || cRace.day === 'Sat' || cRace.day === 'Sun');
    if (!(cRace && !cReplacesLong && cRace.day === p.keyDay)) {
      add({ day: keyKind === 'race_sim' ? simDay : p.keyDay, kind: keyKind, key: true, minutes: deload || taperWeek ? Math.max(30, p.minutes - 10) : p.minutes });
    }
    let runs = Math.min(p.runDays.length, p.runsBase + Math.floor((plan.week - 1) / 4));
    if (p.beginnerRunner) runs = Math.min(3, p.runDays.length);
    runs = Math.max(runs, used(p.keyDay).length ? 1 : 0);
    // Long run (none when a C race replaces it).
    if (p.longDay && !cReplacesLong && !used(p.longDay).length) {
      const lr = longRun();
      const minutes = deload ? Math.max(30, Math.round(lr.minutes * 0.75)) : taperWeek ? Math.max(30, Math.round(lr.minutes * 0.55)) : lr.minutes;
      add({ day: p.longDay, kind: 'long_run', minutes, stage: lr.stage, efforts: lr.efforts && !deload && !taperWeek && !noQuality });
    }
    // A second quality run: 4+ runs, intermediate/advanced, build/specific, not deload/taper.
    if (runs >= 4 && !p.beginnerRunner && p.level !== 'beginner' && (plan.phase === 'build' || plan.phase === 'specific') && !deload && !noQuality && !taperWeek) {
      const d = p.runDays.find((x) => !used(x).length && !adjacentInterval(x) && x !== next(p.keyDay, 1));
      if (d) add({ day: d, kind: 'quality_run', minutes: p.minutes });
    }
    // Compromised: from the build phase, unless an own Hyathlon-style class covers it.
    if (plan.phase !== 'base' && !deload && !noQuality && !p.ownCompromisedClass && keyKind !== 'race_sim') {
      const d = p.runDays.find((x) => !used(x).length && !adjacentInterval(x) && (!p.longDay || x !== next(p.longDay, -1)));
      if (d) add({ day: d, kind: 'compromised', minutes: p.minutes });
    }
    // Easy runs on the remaining running days; the day after the long run is easy.
    const runCount = () => slots.filter((s) => ['key_run', 'aerobic_key', 'quality_run', 'long_run', 'easy_run', 'recovery_run'].includes(s.kind)).length;
    const order = [...p.runDays].sort((a, b) => (p.longDay && a === next(p.longDay, 1) ? -1 : p.longDay && b === next(p.longDay, 1) ? 1 : 0));
    for (const d of order) {
      if (runCount() >= runs) break;
      if (used(d).length) continue;
      if (p.beginnerRunner && threeInARow(slots, d)) continue;
      if (cRace && d === next(cRace.day, -1)) continue; // the day before a C race stays easy or rest (added below)
      add({ day: d, kind: p.longDay && d === next(p.longDay, 1) ? 'recovery_run' : 'easy_run', minutes: p.minutes });
    }
    // Beginners: 1 cross-training session, the day after the long run if free.
    if (p.beginnerRunner) {
      const d = [p.longDay ? next(p.longDay, 1) : null, ...p.trainingDays].find((x) => x && p.trainingDays.includes(x) && !used(x).length && !threeInARow(slots, x));
      if (d) add({ day: d, kind: 'off_feet_easy', minutes: p.minutes });
    }
    if (cRace) cRaceLeadIn(p, cRace, slots, add, used);
  } else {
    noProgrammedRunningSlots(p, plan, sim, add, used, adjacentInterval);
  }

  placeStrength(p, slots, strengthTotal, optionalStrength, taperWeek || deload, add, used);

  // Frequency weeks add an optional easy session on a free day.
  if (plan.lever === 'frequency') {
    const d = p.trainingDays.find((x) => !used(x).length);
    if (d) add({ day: d, kind: p.running === 'programmed' && p.runDays.includes(d) ? 'easy_run' : 'off_feet_easy', minutes: p.minutes, optional: true, slotKey: 'extra-easy' });
  }
  return slots.sort((a, b) => idx(a.day) - idx(b.day) || a.order - b.order);
}

function threeInARow(slots: Slot[], d: Day): boolean {
  const has = (x: Day) => x === d || slots.some((s) => s.day === x);
  return [[-2, -1], [-1, 1], [1, 2]].some(([a, b]) => has(next(d, a)) && has(next(d, b)));
}

function cRaceLeadIn(p: SkeletonProfile, c: NonNullable<WeekPlan['event']>, slots: Slot[], add: (s: Partial<Slot> & Pick<Slot, 'day' | 'kind' | 'minutes'>) => Slot, used: (d: Day) => Slot[]) {
  const dayBefore = next(c.day, -1);
  // Hard sessions never the day before the race; beginners/intermediates rest two days before and shake out the day before.
  for (let i = slots.length - 1; i >= 0; i--) {
    if (slots[i].day === dayBefore || (!p.advanced && slots[i].day === next(c.day, -2) && !slots[i].key)) {
      if (slots[i].key) continue;
      slots.splice(i, 1);
    }
  }
  if (p.running === 'programmed' && p.runDays.includes(dayBefore) && !used(dayBefore).length) {
    add({ day: dayBefore, kind: 'shakeout', minutes: Math.min(p.minutes, 25), note: `C race (${c.name}) tomorrow` });
  }
}

function raceWeekSlots(
  p: SkeletonProfile,
  raceDay: Day,
  add: (s: Partial<Slot> & Pick<Slot, 'day' | 'kind' | 'minutes'>) => Slot,
  used: (d: Day) => Slot[],
  midProgram: boolean,
): Slot[] {
  const r = idx(raceDay);
  const slots: Slot[] = [];
  const before = (n: number) => p.trainingDays.filter((d) => r - idx(d) >= n);
  if (p.running === 'programmed') {
    // Sharpener at least 4–5 days out (the latest such running day), easy runs after, a shakeout the day before.
    const sharpDay = p.runDays.filter((d) => r - idx(d) >= 4).at(-1);
    if (sharpDay) slots.push(add({ day: sharpDay, kind: 'sharpener', key: true, minutes: 40 }));
    const easyDays = p.runDays.filter((d) => r - idx(d) >= 2 && d !== sharpDay && !used(d).length).slice(0, Math.max(0, p.runsBase - 2));
    for (const d of easyDays) slots.push(add({ day: d, kind: 'easy_run', minutes: Math.min(p.minutes, 35) }));
    const dayBefore = DAYS[r - 1];
    if (r >= 1 && p.runDays.includes(dayBefore) && !used(dayBefore).length) slots.push(add({ day: dayBefore, kind: 'shakeout', minutes: 20 }));
    if (!sharpDay) {
      const d = p.runDays.filter((x) => r - idx(x) >= 2 && !used(x).length)[0];
      if (d) slots.push(add({ day: d, kind: 'sharpener', key: true, minutes: 30 }));
    }
  } else {
    // No programmed running: a short key session 4–5 days out, easy off-feet before the race.
    const keyDay = before(4).at(-1) ?? before(2).at(-1);
    if (keyDay) {
      const kind: SlotKind = p.homeOffFeet || !p.offFeet.some((o) => o === 'erg' || o === 'bike') ? 'workout' : 'off_feet_intervals';
      slots.push(add({ day: keyDay, kind, key: true, minutes: Math.min(p.minutes, 35) }));
    }
  }
  // One short maintain strength session at least 5 days before the race.
  if (p.strengthPref > 0 && !midProgram) {
    const d = before(5).find((x) => used(x).some((s) => HARD_KINDS.includes(s.kind)) && used(x).length < 2) ?? before(5).find((x) => !used(x).length);
    if (d) {
      const second = used(d).length > 0;
      slots.push(add({ day: d, kind: 'strength', order: second ? 2 : 1, minutes: second ? 30 : Math.min(p.minutes, 40), focus: 'full', maintain: true }));
    }
  }
  return slots.sort((a, b) => idx(a.day) - idx(b.day) || a.order - b.order);
}

function noProgrammedRunningSlots(
  p: SkeletonProfile,
  plan: WeekPlan,
  sim: boolean,
  add: (s: Partial<Slot> & Pick<Slot, 'day' | 'kind' | 'minutes'>) => Slot,
  used: (d: Day) => Slot[],
  adjacentInterval: (d: Day) => boolean,
) {
  const ergs = p.offFeet.some((o) => o === 'erg' || o === 'bike');
  const short = plan.deload || plan.phase === 'taper';
  const keyMinutes = short ? Math.max(25, p.minutes - 10) : p.minutes;
  // Key session.
  const keyKind: SlotKind = sim ? 'race_sim' : p.running === 'own_plan'
    ? (plan.phase === 'base' ? 'hard_strength_key' : 'compromised')
    : ergs ? 'off_feet_intervals' : 'workout';
  const keyDay = p.ownHardDays.includes(p.keyDay) || adjacentInterval(p.keyDay)
    ? p.trainingDays.find((d) => !p.ownHardDays.includes(d) && !adjacentInterval(d)) ?? p.keyDay : p.keyDay;
  add({ day: keyDay, kind: keyKind, key: true, minutes: keyMinutes });
  if (p.homeOffFeet) return; // key + strength; other days rest or an easy walk
  // Conditioning on other training days: easy off-feet, and one hard workout not next to another interval day.
  let hard = plan.deload ? 1 : 0;
  for (const d of p.trainingDays) {
    if (used(d).length || p.ownHardDays.includes(d)) continue;
    if (p.running === 'own_plan') continue; // their own runs are the conditioning
    if (hard === 0 && !adjacentInterval(d) && !short) {
      add({ day: d, kind: ergs ? 'off_feet_intervals' : 'workout', minutes: p.minutes });
      hard++;
    } else if (ergs) {
      add({ day: d, kind: 'off_feet_easy', minutes: p.minutes });
    }
  }
}

function placeStrength(
  p: SkeletonProfile,
  slots: Slot[],
  total: number,
  optional: number,
  maintain: boolean,
  add: (s: Partial<Slot> & Pick<Slot, 'day' | 'kind' | 'minutes'>) => Slot,
  used: (d: Day) => Slot[],
) {
  const keyStrength = slots.filter((s) => s.kind === 'hard_strength_key').length;
  let left = Math.max(0, total - keyStrength);
  if (!left && !optional) return;
  const targets = slots.filter((s) => s.kind === 'key_run' || s.kind === 'aerobic_key' || (s.kind === 'long_run' && s.efforts)).map((s) => s.day);
  const longDay = slots.find((s) => s.kind === 'long_run')?.day;
  const ownHardRuns = p.running === 'own_plan' ? p.ownHardDays : [];
  const heavyTargets = [...new Set([...targets, ...(longDay ? [longDay] : []), ...ownHardRuns])];
  const recoveryDays = slots.filter((s) => s.kind === 'recovery_run').map((s) => s.day);
  const focusFor = (d: Day, order: 1 | 2): Slot['focus'] => {
    const dayBefore = heavyTargets.some((t) => t === next(d, 1));
    const twoBeforePM = order === 2 && heavyTargets.some((t) => t === next(d, 2));
    return dayBefore || twoBeforePM ? 'upper_core' : 'lower';
  };
  let lowerDone = 0;
  const place = (d: Day, order: 1 | 2, opt = false) => {
    let focus = focusFor(d, order);
    if (focus === 'lower' && lowerDone >= 1) focus = 'full';
    if (focus !== 'upper_core') lowerDone++;
    const minutes = order === 2 ? SECOND_STRENGTH_MIN(p.minutes) : p.minutes;
    add({ day: d, kind: 'strength', order, minutes, focus, maintain, optional: opt, slotKey: opt ? 'deload-strength' : undefined });
  };
  const hardDays = slots.filter((s) => HARD_KINDS.includes(s.kind) && s.kind !== 'race_sim').map((s) => s.day);
  const okSecond = (d: Day) => used(d).length === 1 && !used(d).some((s) => s.kind === 'strength' || s.kind === 'hard_strength_key');
  const emptyOwnDay = (d: Day) =>
    !used(d).length && !recoveryDays.includes(d) && !hardDays.includes(next(d, -1)) && !p.ownHardDays.includes(next(d, 1))
    && !slots.some((s) => s.day === next(d, 1) && HARD_KINDS.includes(s.kind));
  const order: Array<[Day, 1 | 2]> = [];
  const hardPM = hardDays.filter(okSecond).map((d) => [d, 2] as [Day, 1 | 2]);
  const ownDays = p.trainingDays.filter(emptyOwnDay).map((d) => [d, 1] as [Day, 1 | 2]);
  const easyPM = slots.filter((s) => (s.kind === 'easy_run' || s.kind === 'off_feet_easy' || s.kind === 'walk') && !recoveryDays.includes(s.day)).map((s) => s.day)
    .filter(okSecond).map((d) => [d, 2] as [Day, 1 | 2]);
  if (p.placement === 'own_days') order.push(...ownDays, ...hardPM, ...easyPM);
  else order.push(...hardPM, ...ownDays, ...easyPM);
  for (const [d, o] of order) {
    if (!left) break;
    if (used(d).length >= 2 || used(d).some((s) => s.kind === 'strength')) continue;
    if (o === 2 && !okSecond(d)) continue;
    if (o === 1 && used(d).length) continue;
    place(d, o);
    left--;
  }
  if (optional) {
    const spot = order.find(([d, o]) => (o === 1 ? !used(d).length : okSecond(d)));
    if (spot) place(spot[0], spot[1], true);
  }
}

// ---------------------------------------------------------------------------
// Slots in the prompt, and matching Claude's sessions to them
// ---------------------------------------------------------------------------

const KIND_TEXT: Record<SlotKind, string> = {
  key_run: 'KEY: the main interval run (one Run part, run_type key) at RPE 8+',
  aerobic_key: 'KEY: the week\'s main aerobic run (one Run part, run_type key) before intervals start: aerobic, with 30 s efforts if this week allows them; no intervals',
  quality_run: 'a second interval run (one Run part, run_type key) at RPE 8+, a different session type from the key run',
  long_run: 'the long run (one Run part, run_type long)',
  easy_run: 'an easy run (one Run part, run_type easy) at RPE 5–6 · Easy',
  recovery_run: 'an easy absorption run the day after the long run (one Run part, run_type recovery or easy), RPE 1–4 or 5–6',
  sharpener: 'KEY (race week): the sharpener (one Run part, run_type key): 10–15 min easy, 15 min just slower than race effort at RPE 8, 10–15 min easy',
  shakeout: 'a short shakeout (one Run part, run_type easy) at RPE 5–6',
  compromised: 'a compromised session: a CompromisedRun part from the compromised sessions listed (or a Compromised part), session_type compromised',
  race_sim: 'KEY: a race simulation (RaceSim part; run segments swapped for erg or bike if the athlete doesn\'t run)',
  strength: 'a strength session (Strength part from a Strength template; working sets × 6–10 reps)',
  hard_strength_key: 'KEY: a hard strength session (Strength part from a Strength template, build)',
  off_feet_intervals: 'an off-feet interval session (HIIT or Tabata part) on an erg, bike or bodyweight at RPE 8+',
  workout: 'a hard AMRAP / EMOM-type workout (AMRAP, EMOM or ForTime parts) at RPE 8+',
  off_feet_easy: 'an easy off-feet session (Aerobic part: erg, bike or brisk walk) at RPE 5–6',
  walk: 'an easy brisk walk + mobility (Aerobic part with the brisk walk), RPE 5–6',
};

export function describeSlots(slots: Slot[], frame: { warmup_min: number; cooldown_min: number }): string {
  return slots.map((s, i) => {
    const second = s.order === 2 ? ' (second session of the day, at least 6 h after the first where possible)' : '';
    const minutes = s.kind === 'long_run'
      ? `long run ${s.minutes} min (Run part minutes ${s.minutes})${s.stage ? `, stage ${s.stage}` : ''}${s.efforts ? ', with race-effort segments' : ', no efforts'}`
      : s.kind === 'strength' && s.order === 2
      ? `one ${s.minutes}-min Strength template (its own warm-up and cool-down)`
      : `${s.minutes} min in total (parts ${Math.max(5, s.minutes - frame.warmup_min - frame.cooldown_min)} min + warm-up and cool-down)`;
    const focus = s.focus ? `; focus ${s.focus === 'upper_core' ? 'UPPER BODY + CORE ONLY (no squats, hinges, lunges or sled)' : s.focus === 'lower' ? 'lower body' : 'full body'}` : '';
    return `${i + 1}. ${s.day}${second}: ${KIND_TEXT[s.kind]}; ${minutes}${focus}${s.maintain ? '; maintain (1–2 working sets, same load and intent)' : ''}${s.optional ? `; OPTIONAL (slot "${s.slotKey}")` : ''}${s.note ? `; ${s.note}` : ''}`;
  }).join('\n');
}

/**
 * Claude returns the sessions in slot order. Day, AM/PM, key and optional come from
 * the skeleton (overwritten); each session must match its slot's kind.
 */
export function applySkeleton(week: BlockWeek, slots: Slot[], lever: OutlineWeek['lever']): string[] {
  const label = `Week ${week.week}`;
  if (week.sessions.length !== slots.length) {
    return [`${label}: return exactly ${slots.length} sessions, one per slot in the week plan, in order; you returned ${week.sessions.length}.`];
  }
  week.progression.lever = lever;
  const errors: string[] = [];
  week.sessions.forEach((s, i) => {
    const slot = slots[i];
    s.day = slot.day;
    s.order_in_day = slot.order;
    s.key_session = slot.key;
    s.optional = slot.optional;
    s.slot = slot.optional ? slot.slotKey ?? `optional-${i + 1}` : null;
    if (slot.maintain && (slot.kind === 'strength' || slot.kind === 'hard_strength_key')) s.build_or_maintain = 'maintain';
    if (slot.kind !== 'long_run' && !(slot.kind === 'strength' && slot.order === 2)) s.target_min = slot.minutes;
    const e = slotContentError(s, slot);
    if (e) errors.push(`${label}, session ${i + 1} ("${s.title}", ${slot.day}): ${e}`);
  });
  return errors;
}

function slotContentError(s: Session, slot: Slot): string | null {
  const formats = s.parts.map((p) => p.format);
  const runs = s.parts.filter((p) => p.format === 'Run');
  const only = (...f: string[]) => formats.every((x) => f.includes(x));
  switch (slot.kind) {
    case 'key_run': case 'aerobic_key': case 'quality_run': case 'sharpener':
      return runs.some((p) => p.run_type === 'key') && only('Run', 'Plyometric') ? null : 'this slot is a key/quality run: one Run part with run_type key (no strength or circuits).';
    case 'long_run':
      return runs.some((p) => p.run_type === 'long') && only('Run') ? null : 'this slot is the long run: one Run part with run_type long.';
    case 'easy_run': case 'recovery_run': case 'shakeout':
      return runs.length && runs.every((p) => p.run_type === 'easy' || p.run_type === 'recovery') && only('Run', 'Mobility') ? null : 'this slot is an easy run: Run parts with run_type easy (or recovery), nothing hard.';
    case 'compromised':
      return formats.some((f) => f === 'CompromisedRun' || f === 'Compromised') ? null : 'this slot is a compromised session (CompromisedRun or Compromised part).';
    case 'race_sim':
      return formats.includes('RaceSim') || formats.includes('CompromisedRun') ? null : 'this slot is a race simulation (RaceSim part).';
    case 'strength': case 'hard_strength_key':
      return formats.includes('Strength') && !formats.includes('Run') ? null : 'this slot is a strength session: a Strength part, no running.';
    case 'off_feet_intervals':
      return formats.some((f) => f === 'HIIT' || f === 'Tabata') && !formats.includes('Run') ? null : 'this slot is off-feet intervals (HIIT or Tabata), no running.';
    case 'workout':
      return formats.some((f) => ['AMRAP', 'EMOM', 'ForTime', 'HIIT', 'Tabata'].includes(f)) && !formats.includes('Run') ? null : 'this slot is a hard AMRAP / EMOM-type workout, no running.';
    case 'off_feet_easy': case 'walk':
      return only('Aerobic', 'Mobility') ? null : 'this slot is an easy off-feet session (Aerobic part), nothing hard.';
  }
}

export { next as nextDay };
