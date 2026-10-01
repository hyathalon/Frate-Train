import type { ProgramInputs } from './prompts.ts';

// Starting running level and when intervals start (docs/coaching/workout-design/07
// §1 and §4, and the week rules in system-prompt.md).

export type RunningLevel = 'beginner_1' | 'beginner_2' | 'normal';

/** Weeks of the bridge to 20 min continuous running for Beginner 2 with a race goal. */
export const BRIDGE_WEEKS = 4;

/**
 * From the longest run in the last 3 weeks (onboarding Q5), for programmed running:
 * 0 → Beginner 1 (walk–run), under 20 min → Beginner 2, 20+ → normal programming.
 * "Not sure" → the follow-up "Can you run 20 minutes without stopping?":
 * yes → normal programming, no (or no answer) → Beginner 2.
 */
export function runningLevel(inputs: Pick<ProgramInputs, 'running' | 'longest_run_min' | 'can_run_20_min'>): RunningLevel | null {
  if (inputs.running?.mode !== 'programmed') return null;
  const m = inputs.longest_run_min;
  if (m === null || m === undefined) return inputs.can_run_20_min === 'yes' ? 'normal' : 'beginner_2';
  if (m === 0) return 'beginner_1';
  return m < 20 ? 'beginner_2' : 'normal';
}

/**
 * The program week of the first quality interval session: 30 s efforts come first.
 * Done intervals before → week 2; never (or not said) → week 3. Beginner 2 starts
 * the sequence after the bridge. Beginner 1 builds to continuous running first,
 * so no interval week is planned yet (null).
 */
export function intervalIntroWeek(inputs: Pick<ProgramInputs, 'running' | 'longest_run_min' | 'can_run_20_min' | 'interval_experience'>): number | null {
  const level = runningLevel(inputs);
  if (level === null || level === 'beginner_1') return null;
  const week = inputs.interval_experience === 'yes' ? 2 : 3;
  return level === 'beginner_2' ? BRIDGE_WEEKS + week : week;
}

/** The home beginner off-feet profile: no running, a beginner, and no erg or bike sessions chosen (Q2c). */
export function homeOffFeet(inputs: Pick<ProgramInputs, 'running' | 'off_feet_includes'>, level: string): boolean {
  const off = inputs.off_feet_includes;
  return inputs.running?.mode === 'none' && level === 'beginner' && !!off && !off.includes('erg') && !off.includes('bike');
}

export const RUNNING_LEVEL_LABEL: Record<RunningLevel, string> = {
  beginner_1: 'Beginner 1 (walk–run: build to continuous running first; no interval sessions yet)',
  beginner_2: `Beginner 2 (aerobic runs with walk breaks; a ~${BRIDGE_WEEKS}-week bridge to 20 min continuous first)`,
  normal: 'normal programming',
};
