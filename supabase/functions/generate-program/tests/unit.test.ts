// Unit tests (no network): deno test --allow-read tests/unit.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow } from '../lib/auth.ts';
import { availableFormats, type Candidates, type Exercise, filterExercises, type RaceOption, type SessionFormat, type Template } from '../lib/candidates.ts';
import { HttpError } from '../lib/http.ts';
import { type AppAllowance, assertCanConfirm, assertCanPreview, type CoachAllowance } from '../lib/limits.ts';
import { parseInputs } from '../lib/program.ts';
import { COACHING_RULES } from '../lib/prompts.ts';
import { type Block, normalizeBlock, type Outline, type Session } from '../lib/schemas.ts';
import { localDate, monthWindow, nextMonday, planWindow, zonedMidnight } from '../lib/time.ts';
import { type BlockContext, type Timing, timingKey, validateBlock, validateOutline } from '../lib/validate.ts';

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

Deno.test('nextMonday is always the following Monday', () => {
  assert.equal(nextMonday('2026-09-28'), '2026-10-05');
  assert.equal(nextMonday('2026-09-27'), '2026-09-28');
  assert.equal(nextMonday('2026-10-03'), '2026-10-05');
});

Deno.test('planWindow counts the race week and caps at 16 weeks', () => {
  assert.deepEqual(planWindow('2026-10-05', '2026-11-01', 16), { startDate: '2026-10-05', totalWeeks: 4, daysToRace: 27 });
  const long = planWindow('2026-10-05', '2027-03-06', 16);
  assert.equal(long.totalWeeks, 16);
  assert.equal(long.startDate, '2026-11-16');
});

Deno.test('Sydney midnights across the October daylight-saving change', () => {
  assert.equal(zonedMidnight(2026, 10, 1, 'Australia/Sydney').toISOString(), '2026-09-30T14:00:00.000Z');
  assert.equal(zonedMidnight(2026, 11, 1, 'Australia/Sydney').toISOString(), '2026-10-31T13:00:00.000Z');
  assert.equal(monthWindow(new Date('2026-10-15T00:00:00Z'), 'Australia/Sydney').resetsOn, '2026-11-01');
});

Deno.test('month and day boundaries follow the athlete timezone', () => {
  const instant = new Date('2026-09-30T15:30:00Z');
  assert.equal(localDate(instant, 'Australia/Sydney'), '2026-10-01');
  assert.equal(localDate(instant, 'Australia/Perth'), '2026-09-30');
});

// ---------------------------------------------------------------------------
// candidates
// ---------------------------------------------------------------------------

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id, name: id, movement_pattern: 'Squat', body_region: 'Lower', methods: ['Strength'], primary_pillar: 'Durability',
  difficulty: 'Beginner', acute_risk: 'Low', where_setting: 'Home or gym', equipment_options: [['Bodyweight']],
  tabata_suitable: false, is_active: true, ...over,
});

const athlete = (over: Partial<AthleteRow> = {}): AthleteRow => ({
  id: 'a', user_id: 'u', name: 'Test', tier: 'app', level: 'beginner', equipment: [], training_locations: [],
  timezone: 'Australia/Sydney', coach_user_id: null, athlete_type: 'hyathlon', ...over,
});

Deno.test('risk and difficulty rules by level', () => {
  const lib = [ex('LOW'), ex('MOD', { acute_risk: 'Moderate', difficulty: 'Intermediate' }), ex('HIGH', { acute_risk: 'High', difficulty: 'Advanced' })];
  const ids = (level: AthleteRow['level']) => filterExercises(lib, athlete({ level })).map((e) => e.id).sort();
  assert.deepEqual(ids('beginner'), ['LOW']);
  assert.deepEqual(ids('intermediate'), ['LOW', 'MOD']);
  assert.deepEqual(ids('advanced'), ['HIGH', 'LOW', 'MOD']);
});

Deno.test('equipment and location filters', () => {
  const lib = [ex('BW'), ex('DB', { equipment_options: [['Dumbbell']] }), ex('KB_OR_DB', { equipment_options: [['Kettlebell'], ['Dumbbell']] }),
    ex('DB_BENCH', { equipment_options: [['Dumbbell', 'Bench']] }), ex('G', { where_setting: 'Gym' })];
  assert.deepEqual(filterExercises(lib, athlete({ equipment: ['Dumbbell'], training_locations: ['Home'] })).map((e) => e.id).sort(), ['BW', 'DB', 'KB_OR_DB']);
});

// ---------------------------------------------------------------------------
// fixtures: formats (as in migration 4), templates, candidates, a valid block
// ---------------------------------------------------------------------------

const fmt = (format: string, over: Partial<SessionFormat>): SessionFormat => ({
  format, label: format, dose_kind: 'time', score: 'none', needs_template: false, running: 'none', rules: {}, description: '', ...over,
});
const formats = new Map<string, SessionFormat>([
  ['Strength', fmt('Strength', { dose_kind: 'sets_reps_load', needs_template: true })],
  ['Circuit', fmt('Circuit', { needs_template: true })],
  ['Tabata', fmt('Tabata', {})],
  ['HIIT', fmt('HIIT', { rules: { exercises: [1, 3] } })],
  ['Aerobic', fmt('Aerobic', { rules: { minutes: [10, 60], exercises: [1, 2] } })],
  ['AMRAP', fmt('AMRAP', { dose_kind: 'reps', rules: { minutes: [8, 20], exercises: [3, 5] } })],
  ['Plyometric', fmt('Plyometric', { dose_kind: 'foot_contacts', rules: { minutes: [6, 20] } })],
  ['Compromised', fmt('Compromised', { dose_kind: 'reps', running: 'capped', rules: { minutes: [10, 60] } })],
  ['RaceSim', fmt('RaceSim', { dose_kind: 'reps', running: 'sim', rules: { minutes: [15, 90] } })],
  ['Run', fmt('Run', { running: 'run', rules: { minutes: [10, 120] } })],
]);

const strengthT: Template = {
  id: 'STR-45', name: 'Strength 45', method: 'Strength', focus: 'Full body', level: 'Beginner', duration_min: 45, warmup_min: 10, cooldown_min: 5,
  structure: '', slots: [
    { slot_order: 1, label: 'Squat', movement_patterns: ['Squat'], body_region: 'Lower', hint: null },
    { slot_order: 2, label: 'Push', movement_patterns: ['Upper push'], body_region: null, hint: null },
  ],
};
const circuitT: Template = {
  id: 'CIR-30', name: 'Circuit 30', method: 'Circuit', focus: 'Full body', level: 'Beginner', duration_min: 30, warmup_min: 7, cooldown_min: 3,
  structure: '', slots: [
    { slot_order: 1, label: 'Squat', movement_patterns: ['Squat'], body_region: null, hint: null },
    { slot_order: 2, label: 'Core', movement_patterns: ['Core'], body_region: null, hint: null },
  ],
};

const race: RaceOption = { id: 'hyathlon-open', race_code: 'H', format: 'Open', label: 'Hyathlon race – Open', run_distance_m: 1000, note: null, segments: [] };

const candidates: Candidates = {
  exercises: new Map([
    ['SQ', ex('SQ', { tabata_suitable: true })],
    ['PU', ex('PU', { movement_pattern: 'Upper push', body_region: 'Upper', tabata_suitable: true })],
    ['CORE', ex('CORE', { movement_pattern: 'Core', body_region: 'Core', tabata_suitable: true })],
    ['BIKE', ex('BIKE', { movement_pattern: 'Erg', equipment_options: [['Air bike']] })],
    ['RUN', ex('RUN', { movement_pattern: 'Running', equipment_options: [['None (running)']] })],
    ['WB', ex('WB', { movement_pattern: 'Med ball / throw' })],
    ['HOP', ex('HOP', { movement_pattern: 'Plyometric', methods: ['Plyometric'] })],
    ['DL', ex('DL', { movement_pattern: 'Hinge', equipment_options: [['Barbell']] })],
  ]),
  templates: new Map([[strengthT.id, strengthT], [circuitT.id, circuitT]]),
  raceSessions: new Map(),
  formats,
  race,
};

// Beginner: 2 Tabata blocks with 120 s between = 10 min.
const timings = new Map<string, Timing>([
  [timingKey('Tabata', 10), { minutes: 10, blocks: 2 }],
  [timingKey('Plyometric', 10), { minutes: 10, drills: [2, 5], contacts: [60, 80] }],
]);

const ALL_FORMATS = new Set(formats.keys());

const item = (id: string, dose: string, over: Record<string, unknown> = {}) => ({
  exercise_id: id, race_session_id: null, dose, cue: null, block: null, foot_contacts: null, run_minutes: null, run_distance_m: null, ...over,
});

type Meta = Pick<Session, 'session_type' | 'build_or_maintain' | 'progression' | 'alternatives'>;
const META: Meta = { session_type: 'strength_endurance', build_or_maintain: 'build', progression: { type: 'extend', change: 'one more rep' }, alternatives: [] };
const ERG_META: Meta = { ...META, session_type: 'aerobic_threshold', alternatives: [{ modality: 'Rower', note: null }] };

// 45-minute sessions: 10 min warm-up + 30 min of parts + 5 min cool-down.
function week(n: number, reps: number, deload = false) {
  const sessions: Session[] = [
    { day: 'Mon', title: 'Strength', key_session: false, pillar: 'Durability', optional: false, slot: null, ...META,
      parts: [{ format: 'Strength', template_id: 'STR-45', run_type: null, minutes: 30, items: [item('SQ', `3 × ${reps}, moderate load, RPE 7`), item('PU', `3 × ${reps}, bodyweight`)] }] },
    { day: 'Wed', title: 'Circuit + Tabata', key_session: true, pillar: 'Threshold', optional: false, slot: null, ...META,
      parts: [
        { format: 'Circuit', template_id: 'CIR-30', run_type: null, minutes: 20, items: [item('SQ', `RPE ${reps - 1}`), item('CORE', 'steady, RPE 7')] },
        { format: 'Tabata', template_id: null, run_type: null, minutes: 10, items: [item('SQ', 'max effort', { block: 1 }), item('PU', 'max effort', { block: 2 }), item('CORE', `max effort, week ${n}`, { block: 2 })] },
      ] },
    { day: 'Fri', title: 'Bike', key_session: false, pillar: 'Aerobic Engine', optional: false, slot: null, ...ERG_META,
      parts: [
        { format: 'HIIT', template_id: null, run_type: null, minutes: 15, items: [item('BIKE', `hard, RPE ${reps}`)] },
        { format: 'Aerobic', template_id: null, run_type: null, minutes: 15, items: [item('BIKE', 'steady, RPE 6-7')] },
      ] },
    { day: 'Sat', title: 'Compromised', key_session: false, pillar: 'Fatigue Management', optional: true, slot: 'compromised', ...META,
      parts: [{ format: 'Compromised', template_id: null, run_type: null, minutes: 30, items: [item('RUN', '400 m run, RPE 8', { run_minutes: 6 }), item('WB', `${reps * 2} wall balls`)] }] },
  ];
  if (deload) sessions.splice(0, 1); // drop Monday: 2 core sessions instead of 3
  return { week: n, focus: 'f', progression: { lever: n === 1 ? 'start' : deload ? 'deload' : 'volume', change: 'c' }, sessions } as Block['weeks'][number];
}

function block(): Block {
  return { summary: 's', weeks: [week(1, 8), week(2, 9), week(3, 10), week(4, 8, true)] } as Block;
}

function outline(): Outline {
  return {
    summary: 's',
    phases: [{ name: 'Base', kind: 'base', start_week: 1, end_week: 3, purpose: 'p' }, { name: 'Taper', kind: 'taper', start_week: 4, end_week: 4, purpose: 'p' }],
    weeks: [1, 2, 3, 4].map((w) => ({
      week: w, phase: w === 4 ? 'taper' : 'base', focus: 'f', load: 'Moderate', deload: w === 4,
      lever: w === 1 ? 'start' : w === 4 ? 'deload' : 'volume', core_sessions: w === 4 ? 2 : 3, optional_sessions: 1,
      key_session: 'Circuit + Tabata', key_sessions: ['k'], pillars: ['Aerobic Engine'],
    })),
  } as Outline;
}

const ctx: BlockContext = {
  startWeek: 1, endWeek: 4, outlineWeeks: outline().weeks, trainingDays: ['Mon', 'Wed', 'Fri', 'Sat'], keySessionDay: 'Wed',
  minutesPerSession: 45, frame: { warmup_min: 10, cooldown_min: 5 }, candidates, timings,
  settings: { minutesTolerance: 5, deloadMin: 0.6, deloadMax: 0.7, deloadSessionMinRatio: 0.5, runShareMax: 0.25 },
  availableFormats: ALL_FORMATS, running: 'none', ownRuns: [], longestRunMin: null, previousLongRunMin: null, finalWeek: 4,
};

const errorsFor = (mutate: (b: Block) => void) => {
  const b = block();
  mutate(b);
  return validateBlock(b, ctx).join(' | ');
};

// ---------------------------------------------------------------------------
// validators
// ---------------------------------------------------------------------------

Deno.test('validateOutline: good outline passes; levers, taper and counts are checked', () => {
  assert.deepEqual(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 4 }), []);
  const o = outline();
  o.weeks[1].lever = 'start';
  assert.match(validateOutline(o, { totalWeeks: 4, daysAvailable: 4 }).join(' '), /must progress one lever/);
  const d = outline();
  d.weeks[3].lever = 'volume';
  assert.match(validateOutline(d, { totalWeeks: 4, daysAvailable: 4 }).join(' '), /deload, so its lever must be "deload"/);
  assert.match(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 2 }).join(' '), /between 1 and 2/);
});

Deno.test('validateBlock: a good block passes', () => {
  assert.deepEqual(validateBlock(block(), ctx), []);
});

Deno.test('days, key session and session length', () => {
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].day = 'Tue'; }), /isn't one of the athlete's training days/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].day = 'Mon'; }), /only one core session per day/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].key_session = false; }), /exactly one core session as the key session/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[1].minutes = 25; }), /lasts 55 min; sessions must be 45 min/);
});

Deno.test('progression: unchanged sessions, frequency and deload size', () => {
  assert.match(errorsFor((b) => { b.weeks[1] = { ...week(1, 8), week: 2, progression: { lever: 'volume', change: 'c' } }; }), /repeats a session from the week before unchanged/);
  assert.match(errorsFor((b) => { b.weeks[1].progression.lever = 'intensity'; }), /the outline's lever is "volume"/);
  // Deload with all three core sessions is 100% of the week before.
  assert.match(errorsFor((b) => { b.weeks[3] = { ...week(4, 7), progression: { lever: 'deload', change: 'c' } }; }), /deload week should be about 60–70%/);
});

Deno.test('formats: templates, Tabata, HIIT, doses and units', () => {
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].template_id = null; }), /Strength parts need a template/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].items.reverse(); }), /doesn't fit slot "Squat"/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].parts[1].items[0].exercise_id = 'DL'; }), /DL is not Tabata-suitable/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].parts[1].items.forEach((it) => { it.block = 1; }); }), /Tabata block 1 needs 1 exercise, or 2 alternating; it has 3.*Tabata block 2 needs 1 exercise, or 2 alternating; it has 0/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].parts[0].items[0].dose = '12 reps'; }), /Circuit is timed, so the dose is time only/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].items[0].dose = '3 sets, RPE 7'; }), /strength is dosed as sets × reps plus a load by feel/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].items[0].dose = '3 × 8 @ 60 kg'; }), /never kg, watts, paces or zones/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[1].items[0].dose = 'Zone 2 steady'; }), /never kg, watts, paces or zones/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[0].items[0].exercise_id = 'DL'; }), /HIIT uses ergs or bodyweight exercises/);
});

Deno.test('running: only in compromised (capped) and race simulations', () => {
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[1].items[0].exercise_id = 'RUN'; }), /no running in Aerobic parts/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[3].parts[0].items[0].run_minutes = 10; }), /running is 10 of 30 min; the cap is 25%/);
  assert.match(errorsFor((b) => {
    b.weeks[0].sessions[3].parts[0] = { format: 'RaceSim', template_id: null, run_type: null, minutes: 30, items: [item('RUN', '1 run', { run_distance_m: 400 }), item('WB', '100 wall balls')] };
  }), /run segments in a Hyathlon race – Open simulation are 1000 m/);
});

Deno.test('regex: "3 x 20s surges" in a timed dose is not reps', () => {
  assert.equal(errorsFor((b) => { b.weeks[0].sessions[2].parts[1].items[0].dose = '15 min @ RPE 6-7 Steady, add 3 x 20s brisk surges'; }), '');
});

Deno.test('only formats available to the athlete', () => {
  assert.match(validateBlock(block(), { ...ctx, availableFormats: new Set([...ALL_FORMATS].filter((f) => f !== 'Tabata')) }).join(' '), /Tabata isn't available for this athlete/);
  const noErgs = { ...candidates, exercises: new Map([...candidates.exercises].filter(([id]) => id !== 'BIKE')) };
  assert.equal(availableFormats(noErgs, 'none').has('Aerobic'), false);
  assert.equal(availableFormats(candidates, 'none').has('Run'), false);
  assert.equal(availableFormats(candidates, 'programmed').has('Run'), true);
});

Deno.test('weekly mix: no running = at least one strength and one conditioning session', () => {
  // Week 2 without Monday's strength session.
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].parts = [{ format: 'AMRAP', template_id: null, run_type: null, minutes: 30, items: [item('SQ', '10 reps'), item('PU', '10 reps'), item('CORE', '10 reps')] }]; }),
    /needs, each in a different core session: strength, hybrid or station/);
});

Deno.test('programmed running: key run, easy/long run, run types and long-run caps', () => {
  const run = (type: string, minutes: number, dose = `${minutes} min @ RPE 6-7 Steady`) =>
    ({ format: 'Run' as const, template_id: null, run_type: type as 'key', minutes, items: [item('RUN', dose)] });
  const programmed: BlockContext = { ...ctx, running: 'programmed' };
  // 3 core sessions: needs a key run, strength, hybrid. Friday becomes the key run.
  const withKeyRun = (b: Block) => { for (const w of b.weeks) if (w.sessions[2]?.day === 'Fri') w.sessions[2].parts = [run('key', 30, `3 × 8 min @ RPE 8-8.5 / 2 min easy, week ${w.week}`)]; };
  const good = block();
  withKeyRun(good);
  assert.deepEqual(validateBlock(good, programmed), []);
  assert.match(validateBlock(block(), programmed).join(' '), /key run/);
  const noType = block();
  withKeyRun(noType);
  noType.weeks[0].sessions[2].parts[0].run_type = null;
  assert.match(validateBlock(noType, programmed).join(' '), /Run parts need run_type/);
  // First long run: at most longest recent run + 5.
  const long = block();
  withKeyRun(long);
  long.weeks[0].sessions[3].parts = [run('long', 60)];
  assert.match(validateBlock(long, { ...programmed, longestRunMin: 45 }).join(' '), /at most 50 min \(longest run in the last 3 weeks \+ 5\)/);
  // No running choice: Run parts aren't allowed.
  assert.match(validateBlock(good, ctx).join(' '), /no Run parts; the athlete didn't choose "Program my running"/);
});

Deno.test('own run plan: no heavy lower-body or sled work the day before a hard run', () => {
  const own: BlockContext = { ...ctx, running: 'own_plan', ownRuns: [{ day: 'Tue', intensity: 'hard' }, { day: 'Thu', intensity: 'easy' }] };
  assert.match(validateBlock(block(), own).join(' '), /"Strength" on Mon has heavy lower-body or sled work the day before the athlete's hard run on Tue/);
  assert.deepEqual(validateBlock(block(), { ...own, ownRuns: [{ day: 'Tue', intensity: 'easy' }] }), []);
});

Deno.test('session fields: progression change and cross-training alternatives', () => {
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].progression.change = ' '; }), /progression\.change/);
  assert.match(errorsFor((b) => { b.weeks[1].sessions[2].alternatives = []; }), /list alternatives/);
  assert.doesNotMatch(errorsFor((b) => { b.weeks[1].sessions[0].alternatives = []; }), /alternatives/);
});

Deno.test('normalizeBlock fills fields Claude left out', () => {
  const raw = { summary: 's', weeks: [{ week: 1, focus: 'f', progression: { lever: 'start', change: 'c' }, sessions: [
    { day: 'Mon', title: 't', key_session: true, pillar: 'Durability', optional: false, parts: [{ format: 'AMRAP', minutes: 10, items: [{ exercise_id: 'SQ', dose: '10 reps' }] }] },
  ] }] } as unknown as Block;
  const n = normalizeBlock(raw);
  const it = n.weeks[0].sessions[0].parts[0].items[0];
  assert.deepEqual(n.weeks[0].sessions[0].alternatives, []);
  assert.deepEqual([n.weeks[0].sessions[0].slot, n.weeks[0].sessions[0].parts[0].template_id, n.weeks[0].sessions[0].parts[0].run_type, it.race_session_id, it.cue, it.block], [null, null, null, null, null, null]);
});

Deno.test('plyometrics go first, within foot-contact limits', () => {
  const plyo = { format: 'Plyometric' as const, template_id: null, run_type: null, minutes: 10, items: [item('HOP', '4 × 10, full recovery', { foot_contacts: 40 }), item('HOP', 'x', { foot_contacts: 30 })] };
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts = [{ ...b.weeks[0].sessions[2].parts[0], minutes: 20 }, plyo]; }), /plyometrics go first/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts = [{ ...plyo, items: [item('HOP', 'a', { foot_contacts: 100 })] }, { ...b.weeks[0].sessions[2].parts[0], minutes: 20 }]; }), /total foot contacts must be 60–80; it is 100/);
});

// ---------------------------------------------------------------------------
// inputs and limits
// ---------------------------------------------------------------------------

const baseInputs = { race_date: '2027-01-20', training_days: ['Sat', 'Mon', 'Wed'], key_session_day: 'Wed', minutes_per_session: 45, goal: '  Sub 90  ' };

Deno.test('parseInputs: running choice', () => {
  assert.deepEqual(parseInputs(baseInputs).running, { mode: 'none', own_runs: [] });
  assert.deepEqual(parseInputs({ ...baseInputs, running: { mode: 'own_plan', own_runs: [{ day: 'Thu', intensity: 'easy' }, { day: 'Tue', intensity: 'hard' }] } }).running.own_runs, [{ day: 'Tue', intensity: 'hard' }, { day: 'Thu', intensity: 'easy' }]);
  assert.throws(() => parseInputs({ ...baseInputs, running: { mode: 'own_plan', own_runs: [] } }), /which days you run/);
  assert.throws(() => parseInputs({ ...baseInputs, running: { mode: 'sometimes' } }), /Choose your running/);
});

Deno.test('parseInputs: training days, key day, minutes and the optional coach inputs', () => {
  const ok = parseInputs({ ...baseInputs, longest_run_min: 60, cross_training_preferences: ['Air bike', 'Rower'] });
  assert.deepEqual(ok.training_days, ['Mon', 'Wed', 'Sat']); // week order
  assert.equal(ok.race_option_id, 'hyathlon-open');
  assert.equal(ok.goal, 'Sub 90');
  assert.equal(ok.longest_run_min, 60);
  const code = (raw: unknown) => {
    try {
      parseInputs(raw);
      return 'ok';
    } catch (e) {
      return (e as HttpError).message;
    }
  };
  assert.match(code({ ...baseInputs, key_session_day: 'Tue' }), /key session/);
  assert.match(code({ ...baseInputs, training_days: ['Mon', 'Mon'] }), /each once/);
  assert.match(code({ ...baseInputs, minutes_per_session: 120 }), /20 to 90 minutes/);
  assert.match(code({ ...baseInputs, longest_run_min: 400 }), /0 to 300/);
  assert.match(code({ ...baseInputs, cross_training_preferences: Array(9).fill('Rower') }), /up to 8/);
});

const app = (previewsLeft: number, confirmationsLeft: number, credits: number): AppAllowance => ({
  kind: 'app', previews: { used: 4 - previewsLeft, limit: 4, left: previewsLeft },
  confirmations: { used: 2 - confirmationsLeft, limit: 2, left: confirmationsLeft }, credits, resetsOn: '2026-10-01', timezone: 'Australia/Sydney',
});

Deno.test('allowance decisions: monthly first, then purchased credits, then refused', () => {
  assertCanPreview(app(1, 0, 0));
  assert.throws(() => assertCanPreview(app(0, 2, 0)), (e: HttpError) => e.code === 'monthly_previews_used');
  assert.equal(assertCanConfirm(app(4, 1, 3)), 'monthly');
  assert.equal(assertCanConfirm(app(4, 0, 3)), 'credit');
  assert.throws(() => assertCanConfirm(app(4, 0, 0)), (e: HttpError) => e.code === 'monthly_confirmations_used');
  const coach = (left: number): CoachAllowance => ({ kind: 'coach', builds: { used: 100 - left, limit: 100, left }, resetsAt: null });
  assert.equal(assertCanConfirm(coach(5)), null);
});

// ---------------------------------------------------------------------------
// coaching rules stay in sync with docs/coaching/system-prompt.md
// ---------------------------------------------------------------------------

Deno.test('prompts.ts coaching rules match docs/coaching/system-prompt.md exactly', () => {
  const doc = Deno.readTextFileSync(new URL('../../../../docs/coaching/system-prompt.md', import.meta.url));
  const fromDoc = doc.slice(doc.indexOf('## Intensity: RPE (zones internal only)')).trimEnd();
  assert.equal(COACHING_RULES, fromDoc, 'Update COACHING_RULES in lib/prompts.ts from docs/coaching/system-prompt.md');
  assert.match(COACHING_RULES, /Body report rated 3\/10 or less \(soreness or niggle\): WAIT AND WATCH/);
  assert.match(COACHING_RULES, /\| Z1 \| Recovery \| 1–4 \|/);
});
