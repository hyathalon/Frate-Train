import { type Candidates, type Exercise, isBodyweightOnly, isErg, isRunning, partMinutes, slotMatches } from './candidates.ts';
import type { Block, BlockWeek, Outline, Session, SessionPart } from './schemas.ts';

// Each validator returns plain-English errors. An empty list means valid.
// The same messages go back to Claude in the one automatic repair attempt.

export interface OutlineContext {
  totalWeeks: number;
  daysAvailable: number;
}

export function validateOutline(outline: Outline, ctx: OutlineContext): string[] {
  const errors: string[] = [];
  const { weeks, phases } = outline;

  if (weeks.length !== ctx.totalWeeks) {
    errors.push(`The outline must have exactly ${ctx.totalWeeks} weeks; it has ${weeks.length}.`);
  }
  weeks.forEach((w, i) => {
    if (w.week !== i + 1) errors.push(`Weeks must be numbered 1 to ${ctx.totalWeeks} in order; position ${i + 1} is week ${w.week}.`);
    if (w.core_sessions < 1 || w.core_sessions > ctx.daysAvailable) {
      errors.push(`Week ${w.week}: core_sessions must be between 1 and ${ctx.daysAvailable} (training days); it is ${w.core_sessions}.`);
    }
    if (w.optional_sessions < 0 || w.optional_sessions > 2) {
      errors.push(`Week ${w.week}: optional_sessions must be between 0 and 2; it is ${w.optional_sessions}.`);
    }
    if (w.pillars.length === 0) errors.push(`Week ${w.week}: list at least one pillar.`);
    if (i === 0 && w.lever !== 'start') errors.push('Week 1 must use lever "start".');
    if (i > 0 && w.deload && w.lever !== 'deload') errors.push(`Week ${w.week} is a deload, so its lever must be "deload".`);
    if (i > 0 && !w.deload && (w.lever === 'start' || w.lever === 'deload')) {
      errors.push(`Week ${w.week} must progress one lever: frequency, intensity or volume.`);
    }
  });

  const last = weeks[weeks.length - 1];
  if (last && last.phase !== 'taper') errors.push('The final (race) week must be in the taper phase.');

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
  keySessionDay: string;
  minutesPerSession: number;
  frame: { warmup_min: number; cooldown_min: number };
  candidates: Candidates;
  timings: Map<string, Timing>; // plan_format() results, keyed by timingKey
  settings: BlockSettings;
  previousWeek?: BlockWeek; // the last week of the previous block, if any
}

const DEFAULT_LEEWAY = 0.05;

// "10 reps", "3 x 10", "3 × 10" – but not "4 x 20 m" or "5 x 2 min".
const REPS_RE = /\b\d+\s*reps?\b|\b\d+\s*[x×]\s*\d+(?!\s*(?:s|sec|secs|seconds|min|mins|minutes|m|km|cal|cals)\b)(?!\s*[-–(])/i;
const SETS_REPS_RE = /\b\d+\s*(?:sets?\s*(?:\([^)]*\)\s*)?)?[x×]\s*\d+/i;
const LOAD_BY_FEEL_RE = /\b(rpe|load|bodyweight|light|moderate|heavy|by feel|race standard)\b/i;
// Coach's rule: intensity by RPE and feel, never fixed units or zones.
const FORBIDDEN_UNITS_RE = /\b\d+(?:\.\d+)?\s*(?:kg|kgs|lb|lbs|watts?|w)\b|\/\s*km\b|\bmin\/km\b|\bpace\s*\d|\bzone\s*\d/i;

function sessionSignature(s: Session): string {
  return JSON.stringify(s.parts.map((p) => [p.format, p.template_id, p.minutes, p.items.map((i) => [i.exercise_id, i.race_session_id, i.dose])]));
}

function coreMinutes(week: BlockWeek, ctx: BlockContext): number {
  return week.sessions
    .filter((s) => !s.optional)
    .reduce((sum, s) => sum + ctx.frame.warmup_min + ctx.frame.cooldown_min + s.parts.reduce((m, p) => m + p.minutes, 0), 0);
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
      errors.push(`${label}: the outline has ${plan.core_sessions} core sessions; the block has ${core.length}.`);
    }
    if (plan && optional.length > plan.optional_sessions) {
      errors.push(`${label}: at most ${plan.optional_sessions} optional sessions; the block has ${optional.length}.`);
    }

    // Days: only the athlete's days, one core session per day, key session on the key day.
    for (const s of week.sessions) {
      if (!ctx.trainingDays.includes(s.day)) errors.push(`${label}: "${s.title}" is on ${s.day}, which isn't one of the athlete's training days (${ctx.trainingDays.join(', ')}).`);
    }
    if (new Set(core.map((s) => s.day)).size !== core.length) errors.push(`${label}: only one core session per day.`);
    const keys = core.filter((s) => s.key_session);
    if (keys.length !== 1) errors.push(`${label}: mark exactly one core session as the key session.`);
    else if (keys[0].day !== ctx.keySessionDay) errors.push(`${label}: the key session must be on ${ctx.keySessionDay}.`);
    if (optional.some((s) => s.key_session)) errors.push(`${label}: optional sessions can't be the key session.`);

    // Progression: one lever, matching the outline.
    if (plan && week.progression.lever !== plan.lever) {
      errors.push(`${label}: the outline's lever is "${plan.lever}" but the block uses "${week.progression.lever}".`);
    }
    if (previous && week.progression.lever === 'frequency' && week.sessions.length <= previous.sessions.length) {
      errors.push(`${label}: a frequency week must add a session (as optional first); it has ${week.sessions.length}, the week before had ${previous.sessions.length}.`);
    }
    if (previous && week.progression.lever === 'deload') {
      const ratio = coreMinutes(week, ctx) / Math.max(1, coreMinutes(previous, ctx));
      const lo = ctx.settings.deloadMin - DEFAULT_LEEWAY, hi = ctx.settings.deloadMax + DEFAULT_LEEWAY;
      if (ratio < lo || ratio > hi) {
        errors.push(`${label}: a deload week should be about ${Math.round(ctx.settings.deloadMin * 100)}–${Math.round(ctx.settings.deloadMax * 100)}% of the previous week's core minutes; it is ${Math.round(ratio * 100)}%.`);
      }
    }
    if (previous) {
      const before = new Set(previous.sessions.map(sessionSignature));
      for (const s of week.sessions) {
        if (before.has(sessionSignature(s))) errors.push(`${label}: "${s.title}" repeats a session from the week before unchanged; progress load, sets, reps or density.`);
      }
    }

    week.sessions.forEach((s, j) => validateSession(s, `${label}, session ${j + 1} ("${s.title}")`, week.progression.lever === 'deload', ctx, errors));
  });
  return errors;
}

function validateSession(s: Session, where: string, deload: boolean, ctx: BlockContext, errors: string[]) {
  if (s.optional && !s.slot) errors.push(`${where}: optional sessions need a slot key.`);
  if (!s.optional && s.slot) errors.push(`${where}: core sessions have slot null.`);
  if (s.parts.length < 1 || s.parts.length > 3) errors.push(`${where}: a session has 1 to 3 parts.`);

  const total = ctx.frame.warmup_min + ctx.frame.cooldown_min + s.parts.reduce((m, p) => m + p.minutes, 0);
  const tol = ctx.settings.minutesTolerance;
  const minTotal = deload ? Math.floor(ctx.minutesPerSession * ctx.settings.deloadSessionMinRatio) : ctx.minutesPerSession - tol;
  if (total < minTotal || total > ctx.minutesPerSession + tol) {
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
    if (FORBIDDEN_UNITS_RE.test(item.dose) || (item.cue && FORBIDDEN_UNITS_RE.test(item.cue))) {
      errors.push(`${at}: write intensity as RPE or feel; never kg, watts, paces or zones ("${item.dose}").`);
    }
    // Dose kind by format.
    if (f.dose_kind === 'time' && REPS_RE.test(item.dose)) errors.push(`${at}: ${part.format} is timed, so the dose is time only, no reps ("${item.dose}").`);
    if (f.dose_kind === 'reps' && !/\d/.test(item.dose)) errors.push(`${at}: ${part.format} is dosed in reps (or distance); give a number.`);
    if (f.dose_kind === 'sets_reps_load' && (!SETS_REPS_RE.test(item.dose) || !LOAD_BY_FEEL_RE.test(item.dose))) {
      errors.push(`${at}: strength is dosed as sets × reps plus a load by feel (e.g. "3 × 8, moderate load, RPE 7"); got "${item.dose}".`);
    }
    if (f.dose_kind === 'foot_contacts' && !(item.foot_contacts && item.foot_contacts > 0)) errors.push(`${at}: plyometric drills need foot_contacts.`);
    // Running only in race simulations and compromised parts.
    if (exercise && isRunning(exercise)) {
      if (f.running === 'none') errors.push(`${at}: no running in ${part.format} parts; running only appears in race simulations and compromised parts.`);
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
  } else if (part.template_id) {
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
        if (e && !isErg(e)) errors.push(`${where}, item ${k + 1}: steady aerobic parts use ergs.`);
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
    case 'RaceSim':
    case 'Station':
      inRange(range(rules.minutes), part.minutes, 'the minutes');
      break;
  }
}
