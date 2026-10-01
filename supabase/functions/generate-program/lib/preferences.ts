import type { AthleteRow } from './auth.ts';
import { HttpError } from './http.ts';
import { DAYS } from './schemas.ts';

// Onboarding answers (onboarding-and-check-in.md §1), stored as the athlete gave
// them in athlete_preferences.answers, and their conversion to generator inputs
// and library terms. Health questions (16–18) are not accepted until the consent
// step exists (decision B).

type Day = (typeof DAYS)[number];
export type Answers = Record<string, unknown>;

const HEALTH_KEYS = ['current_body_reports', 'injury_history', 'cycle_tracking'];

// Q9 time per session → minutes per session.
export const SESSION_MINUTES: Record<string, number> = { under_30: 25, '30_45': 40, '45_60': 50, '60_90': 75, '90_plus': 90 };

// Q3 training age → level: under 1 year beginner, 1–3 years intermediate, 3+ advanced.
export const LEVEL_FROM_TRAINING_AGE: Record<string, AthleteRow['level']> = {
  under_6_months: 'beginner', '6_12_months': 'beginner', '1_3_years': 'intermediate', '3_plus_years': 'advanced',
};

// Q11 / Q12 equipment (onboarding labels) → exercise-library equipment names.
export const EQUIPMENT_NAMES: Record<string, string[]> = {
  'Bodyweight only': [],
  Dumbbells: ['Dumbbell', 'Kettlebell or dumbbell'],
  Kettlebells: ['Kettlebell', 'Kettlebell or dumbbell'],
  'Barbell and plates': ['Barbell', 'Plate'],
  'Resistance bands': ['Band'],
  'Cable machine': ['Cable machine'],
  'Pin-loaded machines': ['Machine'],
  'Smith machine': ['Smith machine'],
  'Pull-up bar': ['Pull-up bar'],
  Bench: ['Bench'],
  Sled: ['Sled'],
  Sandbag: ['Sandbag'],
  'Wall ball': ['Wall ball'],
  'Full gym': [
    'Barbell', 'Plate', 'Dumbbell', 'Kettlebell', 'Kettlebell or dumbbell', 'Bench', 'Box', 'Cable machine', 'Machine', 'Smith machine',
    'Pull-up bar', 'Dip bars', 'Sled', 'Sandbag', 'Wall ball', 'Med ball', 'Trap bar', 'Landmine', 'Rope', 'Band', 'Ab wheel', 'GHD',
  ],
  'Air bike': ['Air bike'],
  BikeErg: ['BikeErg'],
  'Bike (indoor or outdoor)': ['Bike'],
  Elliptical: ['Cross-trainer'],
  SkiErg: ['SkiErg'],
  'Rowing erg': ['Rower'],
  Treadmill: ['Treadmill'],
  'Pool: swimming': ['Pool (swimming)'],
  'Pool: aqua / pool running': ['Pool (aqua running)'],
  None: [],
};

const LOCATIONS: Record<string, string> = { Gym: 'Gym', Home: 'Home', Outdoors: 'Outdoor' };
const DIVISIONS: Record<string, { option: string; label: string }> = {
  open: { option: 'hyathlon-open', label: 'Open' },
  pro: { option: 'hyathlon-pro', label: 'Pro' },
  doubles: { option: 'hyathlon-doubles', label: 'Doubles' },
};

/** Days to suggest for Q7/Q8: the given number, spread as evenly as possible over the days not ruled out. */
export function suggestTrainingDays(daysAvailable: number, unavailable: string[]): Day[] {
  const open = DAYS.filter((d) => !unavailable.includes(d));
  if (daysAvailable >= open.length) return [...open];
  let best: number[] = [];
  let bestScore = -1;
  const idx = open.map((d) => DAYS.indexOf(d));
  const choose = (start: number, picked: number[]) => {
    if (picked.length === daysAvailable) {
      // The smallest gap between training days around the week; larger is better, then fewer back-to-backs.
      const gaps = picked.map((d, i) => ((picked[(i + 1) % picked.length] - d + 7) % 7) || 7);
      const score = Math.min(...gaps) * 100 - gaps.filter((g) => g === 1).length;
      if (score > bestScore) [bestScore, best] = [score, [...picked]];
      return;
    }
    for (let i = start; i < idx.length; i++) choose(i + 1, [...picked, idx[i]]);
  };
  choose(0, []);
  return best.map((i) => DAYS[i]);
}

/** Q2b: the preferred key day if it's a training day; otherwise the middle training day. */
export function suggestKeyDay(trainingDays: string[], preferred: string | null | undefined): string {
  if (preferred && trainingDays.includes(preferred)) return preferred;
  return trainingDays[Math.floor(trainingDays.length / 2)];
}

/** Library equipment names for the athlete's Q11 + Q12 answers. */
export function equipmentFromAnswers(a: Answers): string[] {
  const labels = [...asStrings(a.strength_equipment), ...asStrings(a.off_feet_equipment)];
  return [...new Set(labels.flatMap((l) => EQUIPMENT_NAMES[l] ?? []))];
}

/** The athlete-row fields the answers decide (level, equipment, locations), where answered. */
export function athleteFieldsFromAnswers(a: Answers): Partial<Pick<AthleteRow, 'level' | 'equipment' | 'training_locations'>> {
  const out: Partial<Pick<AthleteRow, 'level' | 'equipment' | 'training_locations'>> = {};
  if (typeof a.training_age === 'string' && LEVEL_FROM_TRAINING_AGE[a.training_age]) out.level = LEVEL_FROM_TRAINING_AGE[a.training_age];
  if (a.strength_equipment !== undefined || a.off_feet_equipment !== undefined) out.equipment = equipmentFromAnswers(a);
  if (a.training_locations !== undefined) out.training_locations = asStrings(a.training_locations).map((l) => LOCATIONS[l]).filter(Boolean);
  return out;
}

/** The goal text for the generator, built from Q1: event + division + date. */
export function goalText(a: Answers): string | null {
  const g = a.event_goal as Record<string, unknown> | undefined;
  if (!g) return null;
  if (g.kind === 'hyathlon') {
    const division = DIVISIONS[String(g.division)]?.label ?? 'Open';
    return `Hyathlon race – ${division}${g.name ? ` (${g.name})` : ''} on ${g.date}`;
  }
  if (g.kind === 'none') return 'General fitness and strength, no event in the next 3 months';
  return null;
}

/**
 * Generator inputs (the preview request's `inputs`) from saved answers. parseInputs()
 * validates the result; missing required answers are reported in onboarding terms.
 */
export function programInputsFromAnswers(a: Answers): Record<string, unknown> {
  const g = (a.event_goal ?? {}) as Record<string, unknown>;
  const missing: string[] = [];
  if (!g.kind) missing.push('your main goal event (Q1)');
  if (g.kind === 'running') throw new HttpError(400, 'coming_soon', 'Running-race goals are coming soon. Choose a Hyathlon race or "No event" for now.');
  if (g.kind === 'none') throw new HttpError(400, 'coming_soon', 'Programs without an event are coming soon.');
  if (!a.running_choice) missing.push('how you want running in your program (Q2)');
  if (!a.days_available && !Array.isArray(a.training_days)) missing.push('how many days a week you can train (Q7)');
  if (!a.session_min) missing.push('how much time you have for a session (Q9)');
  if (missing.length) throw new HttpError(400, 'onboarding_incomplete', `Please answer: ${missing.join(', ')}.`);

  const trainingDays = Array.isArray(a.training_days) && a.training_days.length
    ? asStrings(a.training_days)
    : suggestTrainingDays(Number(a.days_available), asStrings(a.days_unavailable));
  const running = a.running_choice === 'program' ? { mode: 'programmed' }
    : a.running_choice === 'own_plan' ? { mode: 'own_plan', own_runs: a.own_runs ?? [] }
    : { mode: 'none' };
  return {
    race_option_id: DIVISIONS[String(g.division)]?.option ?? 'hyathlon-open',
    race_name: g.name ?? null,
    race_date: g.date,
    training_days: trainingDays,
    key_session_day: suggestKeyDay(trainingDays, a.preferred_key_day as string | null),
    minutes_per_session: SESSION_MINUTES[String(a.session_min)],
    goal: goalText(a),
    strengths: [],
    weaknesses: [],
    running,
    longest_run_min: a.longest_run_min ?? null,
    can_run_20_min: a.can_run_20_min ?? null,
    interval_experience: a.interval_experience ?? null,
    runs_per_week: a.runs_per_week ?? null,
    recent_result: a.recent_result ?? null,
    cross_training_preferences: asStrings(a.cross_training_preferences).flatMap((l) => EQUIPMENT_NAMES[l] ?? []).slice(0, 8),
    off_feet_includes: running.mode === 'none' ? a.off_feet_includes ?? [] : null,
    race_sims: a.race_sims ?? null,
    other_events: a.other_events ?? [],
    last_race: a.last_race ?? null,
    hyathlon_races_count: a.hyathlon_races_count ?? null,
    limiters: a.limiters ?? [],
    can_double: a.can_double ?? undefined,
    strength_choice: a.strength_choice ?? undefined,
    own_strength: a.own_strength ?? undefined,
    strength_placement: a.strength_placement ?? undefined,
    strength_sessions_pref: a.strength_choice === 'program' || a.strength_choice === undefined ? a.strength_sessions_pref ?? undefined : undefined,
    training_age: a.training_age ?? null,
    variety_preference: a.variety_preference ?? null,
    repeat_preference: a.repeat_preference ?? null,
    dislikes: a.dislikes ?? null,
    preferred_long_run_day: a.preferred_long_run_day ?? null,
  };
}

/** Rejects health answers (decision B) and anything that isn't an object. */
export function checkAnswers(a: unknown): Answers {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new HttpError(400, 'invalid_input', 'answers must be an object.');
  const bad = Object.keys(a).filter((k) => HEALTH_KEYS.includes(k));
  if (bad.length) throw new HttpError(400, 'invalid_input', 'Body and health questions are available to members after the consent step.');
  return a as Answers;
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
