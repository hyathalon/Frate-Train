import type { AthleteRow } from './auth.ts';
import type { SupabaseClient } from './deps.ts';
import type { RunningMode } from './schemas.ts';

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
  note: string | null;
  segments: string[];
}

export interface SessionFormat {
  format: string;
  label: string;
  dose_kind: 'time' | 'reps' | 'sets_reps_load' | 'foot_contacts';
  score: 'none' | 'rounds_reps' | 'time';
  needs_template: boolean;
  running: 'none' | 'sim' | 'capped' | 'run' | 'uncapped';
  rules: Record<string, unknown>;
  description: string;
}

/** A compromised running session (08 §A2b entry, §A3 standard). */
export interface CompromisedTemplate {
  id: string;
  level: 'entry' | 'standard';
  family: string;
  name: string;
  main_set: string;
  rounds: string;
  stations: string[]; // movement patterns allowed for the stressors ([] = running only)
  purpose: string;
  cue: string | null;
}

export interface Candidates {
  exercises: Map<string, Exercise>;
  templates: Map<string, Template>;
  raceSessions: Map<string, RaceSession>;
  formats: Map<string, SessionFormat>;
  race: RaceOption;
  compromised: Map<string, CompromisedTemplate>; // the athlete's set only (entry or standard)
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
export const isWalking = (e: Exercise) => e.movement_pattern === 'Walking';
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

// Equipment the athlete owns overrides the exercise's location tag (e.g. every
// erg is tagged "Gym", but an athlete with an air bike at home can use it).
function ownsEquipmentFor(exercise: Exercise, owned: Set<string>): boolean {
  return (exercise.equipment_options ?? []).some(
    (option) => option.length > 0 && option.every((item) => owned.has(item)) && option.some((item) => !ALWAYS_AVAILABLE.includes(item)),
  );
}

export function filterExercises(exercises: Exercise[], athlete: AthleteRow): Exercise[] {
  const rank = LEVEL_RANK[athlete.level];
  const risks = ALLOWED_RISK[athlete.level];
  const owned = new Set(athlete.equipment ?? []);
  const have = new Set([...owned, ...ALWAYS_AVAILABLE]);
  const locations = athlete.training_locations ?? [];
  return exercises.filter(
    (e) =>
      e.is_active &&
      risks.includes(e.acute_risk) &&
      DIFFICULTY_RANK[e.difficulty] <= rank &&
      equipmentOk(e, have) &&
      (locationOk(e.where_setting, locations) || ownsEquipmentFor(e, owned)),
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
    .select('id, race_code, format, label, run_distance_m, note')
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
  { includeRaceSessions, compromisedLevel = 'entry' }: { includeRaceSessions: boolean; compromisedLevel?: 'entry' | 'standard' },
): Promise<Candidates> {
  const [exercisesResult, templatesResult, slotsResult, formatsResult, stationsResult, compromisedResult] = await Promise.all([
    admin
      .from('exercises')
      .select('id, name, movement_pattern, body_region, methods, primary_pillar, difficulty, acute_risk, where_setting, equipment_options, tabata_suitable, is_active'),
    admin.from('session_templates').select('id, name, method, focus, level, duration_min, warmup_min, cooldown_min, structure'),
    admin.from('session_template_slots').select('template_id, slot_order, label, movement_patterns, body_region, hint').order('slot_order'),
    admin.from('session_formats').select('format, label, dose_kind, score, needs_template, running, rules, description'),
    admin.from('station_races').select('station_id').eq('race_code', race.race_code),
    admin.from('compromised_templates').select('id, level, family, name, main_set, rounds, stations, purpose, cue').order('sort_order'),
  ]);
  for (const r of [exercisesResult, templatesResult, slotsResult, formatsResult, stationsResult, compromisedResult]) {
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
    compromised: new Map((compromisedResult.data as CompromisedTemplate[])
      .filter((t) => t.level === compromisedLevel)
      .map((t) => [t.id, t])),
  };
}

export const isPlyometric = (e: Exercise) => e.movement_pattern === 'Plyometric' || e.methods.includes('Plyometric');

/** Formats this athlete can actually do, given their candidates and running choice. */
/**
 * Formats this athlete can do. "No running" is off-feet only: race simulations only if
 * they chose them (run segments become their erg or bike), and no compromised running
 * with real runs. offFeet null = not asked (older programs): no restriction.
 */
export function availableFormats(c: Candidates, running: RunningMode, offFeet: string[] | null = null): Set<string> {
  const exercises = [...c.exercises.values()];
  const count = (pred: (e: Exercise) => boolean) => exercises.filter(pred).length;
  const hasTemplate = (method: string) => [...c.templates.values()].some((t) => t.method === method);
  const available = new Set<string>();
  for (const format of c.formats.keys()) {
    const ok = (() => {
      switch (format) {
        case 'Strength':
        case 'Circuit':
        case 'Mobility':
          return hasTemplate(format);
        case 'Tabata':
          return count((e) => e.tabata_suitable) >= 1;
        case 'HIIT':
          return count((e) => isErg(e) || (isBodyweightOnly(e) && !isRunning(e))) >= 1;
        case 'Aerobic':
          return count((e) => isErg(e) || isWalking(e)) >= 1;
        case 'Plyometric':
          return count(isPlyometric) >= 2;
        case 'Run':
          return running === 'programmed' && count(isRunning) >= 1;
        case 'RaceSim':
          if (running === 'none') return (offFeet === null || offFeet.includes('simulations')) && count(isErg) >= 1;
          return count(isRunning) >= 1 || !c.race.run_distance_m;
        case 'Compromised':
          return running !== 'none' && count(isRunning) >= 1;
        case 'CompromisedRun':
          if (c.compromised.size === 0) return false;
          if (running === 'none') return (offFeet === null || offFeet.includes('simulations')) && count(isErg) >= 1;
          return count(isRunning) >= 1;
        default:
          return true; // AMRAP, EMOM, ForTime, Station
      }
    })();
    if (ok) available.add(format);
  }
  return available;
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

/** Compromised running sessions for the prompt: id | name | main set (one round) | rounds | stations | purpose. */
export function formatCompromised(candidates: Candidates): string {
  return [...candidates.compromised.values()]
    .map((t) => [t.id, t.name, t.main_set, `${t.rounds} rounds`, t.stations.length ? t.stations.join('/') : 'running only', `${t.purpose}${t.cue ? ` "${t.cue}"` : ''}`].join(' | '))
    .join('\n');
}

const BIKES = ['Air bike', 'BikeErg', 'Bike'];
const ROW_SKI = ['Rower', 'SkiErg'];
const usesAny = (e: Exercise, names: string[]) => e.equipment_options.some((opt) => opt.some((n) => names.includes(n)));
/** Off-feet choice (onboarding Q2c): bike sessions vs erg (SkiErg / row) sessions. */
export const isBike = (e: Exercise) => isErg(e) && usesAny(e, BIKES);
export const isRowOrSki = (e: Exercise) => isErg(e) && usesAny(e, ROW_SKI) && !isBike(e);

export function formatRaceSessions(candidates: Candidates): string {
  return [...candidates.raceSessions.values()]
    .map((r) => [r.id, r.station, r.name, r.dose ?? '-', r.session_type, r.primary_pillar, r.load].join(' | '))
    .join('\n');
}

export function formatFormats(candidates: Candidates, only?: Set<string>): string {
  return [...candidates.formats.values()]
    .filter((f) => !only || only.has(f.format))
    .map((f) => `${f.format} (${f.label}): ${f.description} Dose: ${f.dose_kind.replace(/_/g, ' ')}.${f.needs_template ? ' Needs a template.' : ''}`)
    .join('\n');
}
