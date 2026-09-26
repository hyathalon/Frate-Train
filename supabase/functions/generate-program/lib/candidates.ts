import type { AthleteRow } from './auth.ts';
import type { SupabaseClient } from './deps.ts';

// Database-first: sessions may only use exercises, templates and race sessions
// from these lists, filtered for the athlete. Risk rules apply to every format.

export interface Exercise {
  id: string;
  name: string;
  movement_pattern: string;
  body_region: string | null;
  methods: string[];
  primary_pillar: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  acute_risk: 'Low' | 'Moderate' | 'High';
  where_setting: string;
  equipment_options: string[][];
  tabata_suitable: boolean;
  is_active: boolean;
}

export interface TemplateSlot {
  slot_order: number;
  label: string;
  movement_patterns: string[];
  body_region: string | null;
  hint: string | null;
}

export interface Template {
  id: string;
  name: string;
  method: string;
  focus: string;
  level: string;
  duration_min: number;
  warmup_min: number;
  cooldown_min: number;
  structure: string;
  slots: TemplateSlot[];
}

/** A template's own length inside a session (the session has one warm-up and cool-down). */
export function partMinutes(t: Template): number {
  return t.duration_min - t.warmup_min - t.cooldown_min;
}

export interface RaceSession {
  id: string;
  station: string;
  name: string;
  dose: string | null;
  session_type: string;
  primary_pillar: string;
  load: string;
  where_setting: string;
}

export interface RaceOption {
  id: string;
  race_code: string;
  format: string;
  label: string;
  run_distance_m: number | null;
  segments: string[];
}

export interface SessionFormat {
  format: string;
  label: string;
  dose_kind: 'time' | 'reps' | 'sets_reps_load' | 'foot_contacts';
  score: 'none' | 'rounds_reps' | 'time';
  needs_template: boolean;
  running: 'none' | 'sim' | 'capped';
  rules: Record<string, unknown>;
  description: string;
}

export interface Candidates {
  exercises: Map<string, Exercise>;
  templates: Map<string, Template>;
  raceSessions: Map<string, RaceSession>;
  formats: Map<string, SessionFormat>;
  race: RaceOption;
}

const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const DIFFICULTY_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 } as const;
export const LEVEL_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;

// Formats whose exercises come from templates (slots balance movement patterns).
const TEMPLATE_FORMATS = ['Strength', 'Circuit', 'Mobility'];

// Beginners: Low only. Intermediates: never High. Advanced: any.
export const ALLOWED_RISK: Record<AthleteRow['level'], Exercise['acute_risk'][]> = {
  beginner: ['Low'],
  intermediate: ['Low', 'Moderate'],
  advanced: ['Low', 'Moderate', 'High'],
};

// Always available regardless of the athlete's equipment list.
const ALWAYS_AVAILABLE = ['Bodyweight', 'None (running)'];

export const isRunning = (e: Exercise) => e.movement_pattern === 'Running';
export const isErg = (e: Exercise) => e.movement_pattern === 'Erg';
export const isBodyweightOnly = (e: Exercise) =>
  (e.equipment_options ?? []).some((option) => option.every((item) => ALWAYS_AVAILABLE.includes(item)));

function equipmentOk(exercise: Exercise, have: Set<string>): boolean {
  const options = exercise.equipment_options ?? [];
  if (options.length === 0) return true;
  return options.some((option) => option.every((item) => have.has(item)));
}

function locationOk(whereSetting: string, locations: string[]): boolean {
  if (locations.length === 0) return true; // not set: don't filter
  switch (whereSetting) {
    case 'Home or gym':
      return locations.includes('Home') || locations.includes('Gym');
    case 'Gym':
      return locations.includes('Gym');
    case 'Outdoor or track':
      return locations.includes('Outdoor');
    default:
      return true;
  }
}

export function filterExercises(exercises: Exercise[], athlete: AthleteRow): Exercise[] {
  const rank = LEVEL_RANK[athlete.level];
  const risks = ALLOWED_RISK[athlete.level];
  const have = new Set([...(athlete.equipment ?? []), ...ALWAYS_AVAILABLE]);
  const locations = athlete.training_locations ?? [];
  return exercises.filter(
    (e) =>
      e.is_active &&
      risks.includes(e.acute_risk) &&
      DIFFICULTY_RANK[e.difficulty] <= rank &&
      equipmentOk(e, have) &&
      locationOk(e.where_setting, locations),
  );
}

export function slotMatches(slot: TemplateSlot, exercise: Exercise): boolean {
  return (
    slot.movement_patterns.includes(exercise.movement_pattern) &&
    (!slot.body_region || slot.body_region === exercise.body_region)
  );
}

/** Templates for the athlete's level whose every slot can be filled from the candidates. */
export function usableTemplates(templates: Template[], exercises: Exercise[], athlete: AthleteRow): Template[] {
  const level = LEVEL_NAME[athlete.level];
  return templates.filter(
    (t) =>
      TEMPLATE_FORMATS.includes(t.method) &&
      (t.level === level || t.level === 'All levels') &&
      t.slots.length > 0 &&
      t.slots.every((slot) => exercises.some((e) => slotMatches(slot, e))),
  );
}

export async function loadRaceOption(admin: SupabaseClient, raceOptionId: string): Promise<RaceOption | null> {
  const { data: option, error } = await admin
    .from('race_format_options')
    .select('id, race_code, format, label, run_distance_m')
    .eq('id', raceOptionId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the race format: ${error.message}`);
  if (!option) return null;
  const { data: segments, error: segError } = await admin
    .from('race_formats')
    .select('segment')
    .eq('race_code', option.race_code)
    .eq('format', option.format)
    .order('sort_order');
  if (segError) throw new Error(`Could not load the race format: ${segError.message}`);
  return { ...option, segments: segments.map((s) => s.segment) };
}

export async function loadCandidates(
  admin: SupabaseClient,
  athlete: AthleteRow,
  race: RaceOption,
  { includeRaceSessions }: { includeRaceSessions: boolean },
): Promise<Candidates> {
  const [exercisesResult, templatesResult, slotsResult, formatsResult, stationsResult] = await Promise.all([
    admin
      .from('exercises')
      .select('id, name, movement_pattern, body_region, methods, primary_pillar, difficulty, acute_risk, where_setting, equipment_options, tabata_suitable, is_active'),
    admin.from('session_templates').select('id, name, method, focus, level, duration_min, warmup_min, cooldown_min, structure'),
    admin.from('session_template_slots').select('template_id, slot_order, label, movement_patterns, body_region, hint').order('slot_order'),
    admin.from('session_formats').select('format, label, dose_kind, score, needs_template, running, rules, description'),
    admin.from('station_races').select('station_id').eq('race_code', race.race_code),
  ]);
  for (const r of [exercisesResult, templatesResult, slotsResult, formatsResult, stationsResult]) {
    if (r.error) throw new Error(`Could not load the library: ${r.error.message}`);
  }

  // Race sessions only for the athlete's race type, and only when the block needs them.
  let raceRows: (Omit<RaceSession, 'id'> & { item_id: string; station_id: string })[] = [];
  if (includeRaceSessions) {
    const stationIds = [...new Set((stationsResult.data ?? []).map((s) => s.station_id))];
    const { data, error } = await admin
      .from('v_station_library')
      .select('item_id, station_id, station, name, dose, session_type, primary_pillar, load, where_setting')
      .eq('row_type', 'session')
      .in('station_id', stationIds);
    if (error) throw new Error(`Could not load race sessions: ${error.message}`);
    raceRows = data;
  }

  const exercises = filterExercises(exercisesResult.data as Exercise[], athlete);

  const slotsByTemplate = new Map<string, TemplateSlot[]>();
  for (const s of slotsResult.data as (TemplateSlot & { template_id: string })[]) {
    const list = slotsByTemplate.get(s.template_id) ?? [];
    list.push(s);
    slotsByTemplate.set(s.template_id, list);
  }
  const templates = usableTemplates(
    (templatesResult.data as Omit<Template, 'slots'>[]).map((t) => ({ ...t, slots: slotsByTemplate.get(t.id) ?? [] })),
    exercises,
    athlete,
  );

  const locations = athlete.training_locations ?? [];
  const raceSessions = raceRows
    .filter((r) => locationOk(r.where_setting, locations))
    .map(({ item_id, station_id: _station, ...rest }) => ({ id: item_id, ...rest }));

  return {
    exercises: new Map(exercises.map((e) => [e.id, e])),
    templates: new Map(templates.map((t) => [t.id, t])),
    raceSessions: new Map(raceSessions.map((r) => [r.id, r])),
    formats: new Map((formatsResult.data as SessionFormat[]).map((f) => [f.format, f])),
    race,
  };
}

// Compact one-line-per-row lists for the prompt.

export function formatExercises(candidates: Candidates): string {
  return [...candidates.exercises.values()]
    .map((e) => {
      const flags = [e.tabata_suitable ? 'T' : '', isRunning(e) ? 'R' : ''].join('') || '-';
      return [e.id, e.name, e.movement_pattern, e.body_region ?? '-', e.methods.join('/'), e.primary_pillar, flags].join(' | ');
    })
    .join('\n');
}

export function formatTemplates(candidates: Candidates): string {
  return [...candidates.templates.values()]
    .map((t) => {
      const slots = t.slots
        .map((s) => `${s.slot_order}) ${s.label} [${s.movement_patterns.join(', ')}]${s.body_region ? ` (${s.body_region})` : ''}`)
        .join('; ');
      return `${t.id} | ${t.method} | ${t.focus} | part ${partMinutes(t)} min | slots: ${slots}`;
    })
    .join('\n');
}

export function formatRaceSessions(candidates: Candidates): string {
  return [...candidates.raceSessions.values()]
    .map((r) => [r.id, r.station, r.name, r.dose ?? '-', r.session_type, r.primary_pillar, r.load].join(' | '))
    .join('\n');
}

export function formatFormats(candidates: Candidates): string {
  return [...candidates.formats.values()]
    .map((f) => `${f.format} (${f.label}): ${f.description} Dose: ${f.dose_kind.replace(/_/g, ' ')}.${f.needs_template ? ' Needs a template.' : ''}`)
    .join('\n');
}
