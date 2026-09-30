import type { OutlineWeek } from './schemas.ts';

// Long-run templates (docs/coaching/workout-design/08 §A5, and the long-run rules in
// system-prompt.md). Bands build the long run to about 80 min; then the coach's
// LR 1–7b stages each change one lever. One step per normal week; logs will drive
// the stepping once session logging exists (plan step 3b).

export interface LongRunStep {
  label: string;
  minutes: [number, number];
  structure: string; // what the session is, with app efforts (the base effort is added per athlete)
  advancedOnly?: boolean;
}

const RACE = 'Hyathlon race effort (RPE 8–8.5)';
export const LONG_RUN_STEPS: LongRunStep[] = [
  { label: 'Band 50–60', minutes: [50, 60], structure: 'continuous easy long run' },
  { label: 'Band 60–70', minutes: [60, 70], structure: 'continuous easy long run' },
  { label: 'Band 70–80', minutes: [70, 80], structure: 'continuous easy long run' },
  { label: 'LR 1', minutes: [80, 90], structure: 'easy long run (time on feet)' },
  { label: 'LR 2', minutes: [80, 90], structure: 'hilly terrain, climbing at an easy hill effort (harder than flat, but no pushing)' },
  { label: 'LR 3', minutes: [85, 90], structure: 'hilly terrain, a steady push up the hills (about RPE 7), recovering on the way down' },
  { label: 'LR 4', minutes: [85, 90], structure: `30 min easy · 4 × 5 min ${RACE} / 10 min easy · rest easy` },
  { label: 'LR 5', minutes: [90, 100], structure: `30 min easy · 4 × 5 min ${RACE} / 3 min easy · rest easy`, advancedOnly: true },
  { label: 'LR 6', minutes: [90, 100], structure: `30 min easy · 6 × 5 min ${RACE} / 3 min easy · rest easy`, advancedOnly: true },
  {
    label: 'LR 7', minutes: [90, 100], advancedOnly: true,
    structure: '30 min easy · 3 × (2 min slightly faster than race effort (RPE 8.5–9) / 2 min float (RPE 6–7) / 1 min easy jog) · 5 min easy · 3 × (2 min slightly faster / 3 min float / 1 min easy jog) · 25–35 min easy',
  },
  {
    label: 'LR 7b', minutes: [90, 100], advancedOnly: true,
    structure: '30 min easy · 4 × (2 min slightly faster than race effort (RPE 8.5–9) / 2 min float (RPE 6–7)) · 5 min easy · 4 × (2 min / 2 min float) · 25–35 min easy',
  },
];

export interface LongRunTarget {
  week: number;
  label: string;
  minutes: [number, number];
  structure: string;
}

/** The long-run base effort: RPE 5–6 · Easy, or 6–7 for advanced runners. */
export const longRunEffort = (advanced: boolean) => (advanced ? 'RPE 6–7' : 'RPE 5–6 · Easy');

/**
 * Each week's long-run target, for athletes whose longest recent run is at least
 * 45 min (shorter: the long run builds by the +10 min rule, and beginners follow
 * their own progressions). The first step fits the longest run; each normal week
 * steps up once; deload weeks repeat the current step at its lower end; taper
 * weeks are an easy long run; race week has none.
 */
export function longRunPlan(longestRunMin: number | null | undefined, advanced: boolean, weeks: Pick<OutlineWeek, 'week' | 'phase' | 'deload' | 'lever'>[], finalWeek: number): Map<number, LongRunTarget> {
  const plan = new Map<number, LongRunTarget>();
  if (longestRunMin == null || longestRunMin < 45) return plan;
  const steps = LONG_RUN_STEPS.filter((s) => advanced || !s.advancedOnly);
  // Highest step whose lower bound is within the athlete's longest run + 5.
  let i = Math.max(0, steps.findLastIndex((s) => s.minutes[0] <= longestRunMin + 5));
  const effort = longRunEffort(advanced);
  for (const w of [...weeks].sort((a, b) => a.week - b.week)) {
    if (w.week === finalWeek) continue; // race week: no long run
    if (w.phase === 'taper') {
      const lo = Math.max(45, steps[i].minutes[0] - 20);
      plan.set(w.week, { week: w.week, label: 'Taper', minutes: [lo, lo + 15], structure: `easy long run, shorter (${effort})` });
      continue;
    }
    if (w.deload || w.lever === 'deload') {
      const lo = steps[i].minutes[0];
      plan.set(w.week, { week: w.week, label: `${steps[i].label} (lighter)`, minutes: [Math.max(45, lo - 15), lo], structure: `${steps[i].structure}, shorter; base effort ${effort}` });
      continue;
    }
    if (w.week > weeks[0].week || plan.size > 0) i = Math.min(i + 1, steps.length - 1);
    plan.set(w.week, { week: w.week, label: steps[i].label, minutes: steps[i].minutes, structure: `${steps[i].structure}; base effort ${effort}` });
  }
  return plan;
}
