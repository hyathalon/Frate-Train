import {
  type Candidates, type Exercise, isBike, isBodyweightOnly, isErg, isRunning, isWalking, partMinutes, slotMatches, type Template,
} from './candidates.ts';
import type { BlockWeek, Session, SessionItem, SessionPart } from './schemas.ts';
import type { Slot, WeekPlan } from './skeleton.ts';

// Template-week fallback (skeleton-rules.md §8): when a week still fails after the
// repairs, its skeleton is filled from the library with fixed session patterns,
// no AI. Plain, safe sessions; the coach is flagged (coaching tiers).

export interface FallbackContext {
  candidates: Candidates;
  frame: { warmup_min: number; cooldown_min: number };
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  advanced: boolean;
  noRunning: boolean; // run segments become erg / bike work
  preferredErgs: string[]; // equipment names, most preferred first
}

const item = (id: string, dose: string, extra: Partial<SessionItem> = {}): SessionItem => ({
  exercise_id: id, race_session_id: null, dose, cue: null, block: null, foot_contacts: null, run_minutes: null, run_distance_m: null, ...extra,
});

const HEAVY_LOWER = ['Squat', 'Hinge', 'Lunge / single-leg', 'Sled'];

export function fallbackWeek(plan: WeekPlan, ctx: FallbackContext): BlockWeek {
  return {
    week: plan.week,
    focus: plan.final ? 'Race week: stay fresh and sharp' : plan.lever === 'deload' ? 'A lighter week to absorb training' : 'Consistent training',
    progression: { lever: plan.lever, change: plan.lever === 'start' ? 'Starting point for the block' : 'Small, steady progression from last week' },
    sessions: plan.slots.map((slot) => fallbackSession(slot, ctx)),
  };
}

function exercises(c: Candidates, pred: (e: Exercise) => boolean): Exercise[] {
  return [...c.exercises.values()].filter(pred);
}

function ergs(ctx: FallbackContext): Exercise[] {
  const all = exercises(ctx.candidates, isErg);
  const rank = (e: Exercise) => {
    const i = ctx.preferredErgs.findIndex((n) => e.equipment_options.some((o) => o.includes(n)));
    return i < 0 ? 99 : i;
  };
  return all.sort((a, b) => rank(a) - rank(b));
}

function runExercise(ctx: FallbackContext): Exercise | undefined {
  const runs = exercises(ctx.candidates, isRunning);
  return runs.find((e) => /^easy run$/i.test(e.name)) ?? runs.find((e) => /run/i.test(e.name) && !/walk|pool|water/i.test(e.name)) ?? runs[0];
}

function base(slot: Slot, title: string, pillar: Session['pillar'], type: Session['session_type'], parts: SessionPart[], alternatives: Session['alternatives'] = []): Session {
  return {
    day: slot.day, order_in_day: slot.order, title, key_session: slot.key, pillar, session_type: type,
    build_or_maintain: slot.maintain ? 'maintain' : 'build',
    progression: { type: 'benchmark', change: 'Standard session from the training library' },
    alternatives, note: slot.optional ? 'Optional: skip it if you need the recovery.' : null,
    optional: slot.optional, slot: slot.optional ? slot.slotKey ?? 'optional' : null, parts,
    target_min: slot.kind === 'long_run' || (slot.kind === 'strength' && slot.order === 2) ? undefined : slot.minutes,
  };
}

function partsMinutes(slot: Slot, ctx: FallbackContext): number {
  return Math.max(5, slot.minutes - ctx.frame.warmup_min - ctx.frame.cooldown_min);
}

function fallbackSession(slot: Slot, ctx: FallbackContext): Session {
  const m = partsMinutes(slot, ctx);
  const run = runExercise(ctx);
  const runPart = (type: SessionPart['run_type'], minutes: number, dose: string): SessionPart =>
    ({ format: 'Run', template_id: null, run_type: type, minutes, items: [item(run!.id, dose)] });
  const easyEffort = 'RPE 5–6 · Easy';
  switch (slot.kind) {
    case 'key_run': case 'quality_run': {
      const reps = Math.max(3, Math.min(8, Math.floor(m / 6)));
      return base(slot, slot.kind === 'key_run' ? 'Threshold intervals' : 'Second quality run', 'Threshold', 'lactate_threshold',
        [runPart('key', m, `${reps} × 4 min @ RPE 8–8.5 · Mod. Hard / 2 min easy jog`)]);
    }
    case 'aerobic_key':
      return base(slot, 'Aerobic run with efforts', 'Aerobic Engine', 'easy_steady', [runPart('key', m, `${m} min @ ${easyEffort}, with 6 × 30 s efforts (RPE 8) / 90 s easy`)]);
    case 'sharpener':
      return base(slot, 'Race sharpener', 'Economy', 'lactate_threshold', [runPart('key', m, `${m} min: 10 min easy, 15 min just slower than race effort @ RPE 8, rest easy`)]);
    case 'long_run':
      return base(slot, 'Long run', 'Aerobic Engine', 'long', [runPart('long', slot.minutes,
        `${slot.minutes} min @ ${ctx.advanced ? 'RPE 6–7' : easyEffort}${slot.efforts ? ', with 4 × 5 min @ RPE 8–8.5 in the second half' : ''}`)]);
    case 'easy_run': case 'shakeout':
      return base(slot, slot.kind === 'shakeout' ? 'Shakeout run' : 'Easy run', 'Aerobic Engine', 'easy_steady', [runPart('easy', m, `${m} min @ ${easyEffort}`)]);
    case 'recovery_run':
      return base(slot, 'Absorption run', 'Fatigue Management', 'recovery', [runPart('recovery', m, `${m} min @ RPE 1–4 · Recovery`)]);
    case 'strength': case 'hard_strength_key':
      return strengthSession(slot, ctx);
    case 'compromised': case 'race_sim':
      return compromisedSession(slot, ctx, m);
    case 'off_feet_intervals': {
      const e = ergs(ctx)[0] ?? exercises(ctx.candidates, (x) => isBodyweightOnly(x) && !isRunning(x) && !isWalking(x) && x.methods.includes('HIIT'))[0]
        ?? exercises(ctx.candidates, (x) => isBodyweightOnly(x) && !isRunning(x) && !isWalking(x))[0];
      return base(slot, 'Off-feet intervals', 'Threshold', 'critical_velocity',
        [{ format: 'HIIT', template_id: null, run_type: null, minutes: m, items: [item(e.id, 'hard, RPE 8–8.5')] }], alternativesFor(e, ctx));
    }
    case 'workout':
      return workoutSession(slot, ctx, m);
    case 'off_feet_easy': case 'walk': {
      const e = slot.kind === 'walk' ? exercises(ctx.candidates, isWalking)[0] : ergs(ctx)[0] ?? exercises(ctx.candidates, isWalking)[0];
      return base(slot, slot.kind === 'walk' || isWalking(e) ? 'Easy walk' : 'Easy aerobic session', 'Aerobic Engine', 'easy_steady',
        [{ format: 'Aerobic', template_id: null, run_type: null, minutes: Math.max(10, m), items: [item(e.id, `steady, ${easyEffort}`)] }], alternativesFor(e, ctx));
    }
  }
}

function alternativesFor(e: Exercise, ctx: FallbackContext): Session['alternatives'] {
  if (!isErg(e)) return [];
  const others = [...new Set(ergs(ctx).filter((x) => x.id !== e.id).map((x) => x.equipment_options[0]?.[0]).filter(Boolean))] as string[];
  return others.slice(0, 2).map((modality) => ({ modality, note: null }));
}

function strengthSession(slot: Slot, ctx: FallbackContext): Session {
  const c = ctx.candidates;
  const templates = [...c.templates.values()].filter((t) => t.method === 'Strength');
  const wantFocus = slot.focus === 'upper_core' ? 'Upper' : slot.focus === 'lower' ? 'Lower' : 'Full body';
  const fits = (t: Template) => slot.order === 2 ? t.duration_min === slot.minutes : Math.abs(t.duration_min - slot.minutes) <= 5;
  const fillable = (t: Template) => t.slots.every((s) => pickFor(s, c, slot.focus === 'upper_core') !== undefined);
  const t = templates.find((x) => fits(x) && x.focus === wantFocus && fillable(x))
    ?? templates.find((x) => fits(x) && (slot.focus !== 'upper_core' || x.focus === 'Upper') && fillable(x))
    ?? templates.find((x) => fits(x) && fillable(x))
    ?? templates.find(fillable)!;
  const dose = slot.maintain ? '2 sets (1–2) × 8, hard with intent: finish with 1–2 good reps left' : '3 sets (2–3) × 8, hard with intent: finish with 1–2 good reps left';
  const used = new Set<string>();
  const items = t.slots.map((s) => {
    const e = pickFor(s, c, slot.focus === 'upper_core', used)!;
    used.add(e.id);
    return item(e.id, dose);
  });
  return base(slot, `${t.focus} strength`, 'Durability', 'strength_endurance',
    [{ format: 'Strength', template_id: t.id, run_type: null, minutes: partMinutes(t), items }]);
}

function pickFor(slot: Template['slots'][number], c: Candidates, upperOnly: boolean, used = new Set<string>()): Exercise | undefined {
  const all = [...c.exercises.values()].filter((e) => slotMatches(slot, e) && !(upperOnly && HEAVY_LOWER.includes(e.movement_pattern)));
  return all.find((e) => !used.has(e.id)) ?? all[0];
}

function compromisedSession(slot: Slot, ctx: FallbackContext, m: number): Session {
  const c = ctx.candidates;
  const minutes = Math.max(20, Math.min(60, m));
  const run = runExercise(ctx);
  const erg = ergs(ctx)[0];
  const mover = ctx.noRunning ? erg : run;
  // A compromised session from the athlete's set: running-only ones first, else one whose stations they have.
  const station = (patterns: string[]) => [...c.exercises.values()].find((e) => patterns.includes(e.movement_pattern) && !isRunning(e) && !isErg(e));
  const t = [...c.compromised.values()].find((x) => x.stations.length === 0) ?? [...c.compromised.values()].find((x) => station(x.stations));
  if (t && mover) {
    const items = [item(mover.id, ctx.noRunning ? '2 min hard, RPE 8–8.5' : '800 m race effort, RPE 8–8.5')];
    const st = t.stations.length ? station(t.stations) : undefined;
    if (st) items.push(item(st.id, '40 s station, load by feel'));
    items.push(item(mover.id, ctx.noRunning ? '1 min easy, RPE 5–6' : '400 m race effort, RPE 8–8.5'));
    return base(slot, slot.kind === 'race_sim' ? 'Race-style session' : 'Compromised session', 'Durability', 'compromised',
      [{ format: 'CompromisedRun', template_id: t.id, run_type: null, minutes, items }], ctx.noRunning && erg ? alternativesFor(erg, ctx) : []);
  }
  // No compromised sessions: a short run + station Compromised part (running capped at 25%).
  const st = station(['Med ball / throw', 'Burpee', 'Carry & grip', 'Lunge / single-leg', 'Squat']);
  const runMin = Math.max(1, Math.floor(minutes * 0.2));
  return base(slot, 'Run and station session', 'Durability', 'compromised', [{
    format: 'Compromised', template_id: null, run_type: null, minutes,
    items: [item((mover ?? run)!.id, '400 m, RPE 8', { run_minutes: runMin }), ...(st ? [item(st.id, '15 reps')] : [])],
  }]);
}

function workoutSession(slot: Slot, ctx: FallbackContext, m: number): Session {
  const c = ctx.candidates;
  const pool = [...c.exercises.values()].filter((e) => isBodyweightOnly(e) && !isRunning(e) && !isWalking(e) && !isErg(e) && !isBike(e)
    && ['Squat', 'Upper push', 'Core', 'Lunge / single-leg', 'Burpee', 'Hinge'].includes(e.movement_pattern));
  const byPattern = new Map<string, Exercise>();
  for (const e of pool) if (!byPattern.has(e.movement_pattern)) byPattern.set(e.movement_pattern, e);
  const picks = [...byPattern.values()].slice(0, 4);
  const amrap = (minutes: number): SessionPart => ({ format: 'AMRAP', template_id: null, run_type: null, minutes, items: picks.map((e) => item(e.id, '10 reps')) });
  const parts = m > 20 ? [amrap(Math.floor(m / 2)), amrap(m - Math.floor(m / 2))] : [amrap(Math.max(8, m))];
  return base(slot, 'Bodyweight AMRAP', 'Threshold', 'strength_endurance', parts);
}
