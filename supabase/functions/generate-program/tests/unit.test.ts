// Unit tests (no network): deno test --allow-read tests/unit.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow } from '../lib/auth.ts';
import { availableFormats, type Candidates, type Exercise, filterExercises, type RaceOption, type SessionFormat, type Template } from '../lib/candidates.ts';
import { HttpError } from '../lib/http.ts';
import { type AppAllowance, assertCanConfirm, assertCanModify, assertCanPreview, type CoachAllowance } from '../lib/limits.ts';
import { athleteFieldsFromAnswers, checkAnswers, programInputsFromAnswers, suggestKeyDay, suggestTrainingDays } from '../lib/preferences.ts';
import { parseInputs } from '../lib/program.ts';
import { COACHING_RULES } from '../lib/prompts.ts';
import { type Block, type BlockWeek, normalizeBlock, type Outline, type Session } from '../lib/schemas.ts';
import { localDate, monthWindow, nextMonday, planWindow, zonedMidnight } from '../lib/time.ts';
import { trimDeload } from '../lib/deload.ts';
import { longRunPlan } from '../lib/longruns.ts';
import { placeRaceWeekStrength } from '../lib/fixups.ts';
import { homeOffFeet, intervalIntroWeek, runningLevel } from '../lib/running.ts';
import { type BlockContext, coreSessionsForStrength, strengthTarget, taperTarget, taperWeeks, type Timing, timingKey, validateBlock, validateOutline, weeklyNeeds } from '../lib/validate.ts';

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
  ['CompromisedRun', fmt('CompromisedRun', { dose_kind: 'reps', running: 'uncapped', rules: { minutes: [20, 60] } })],
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
    ['WALK', ex('WALK', { name: 'Brisk walk', movement_pattern: 'Walking' })],
  ]),
  templates: new Map([[strengthT.id, strengthT], [circuitT.id, circuitT]]),
  raceSessions: new Map(),
  formats,
  race,
  compromised: new Map([['CR-S5', {
    id: 'CR-S5', level: 'standard', family: 'Re-composition', name: 'Fatigue Sandwich', main_set: '500 m race effort · station · 500 m race effort',
    rounds: '6', stations: ['Med ball / throw', 'Lunge / single-leg'], purpose: 'p', cue: null,
  }]]),
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

type Meta = Pick<Session, 'note' | 'order_in_day' | 'session_type' | 'build_or_maintain' | 'progression' | 'alternatives'>;
const META: Meta = { note: null, order_in_day: 1, session_type: 'strength_endurance', build_or_maintain: 'build', progression: { type: 'extend', change: 'one more rep' }, alternatives: [] };
const ERG_META: Meta = { ...META, session_type: 'aerobic_threshold', alternatives: [{ modality: 'Rower', note: null }] };

// 45-minute sessions: 10 min warm-up + 30 min of parts + 5 min cool-down.
function week(n: number, reps: number, deload = false) {
  const sessions: Session[] = [
    { day: 'Mon', title: 'Strength', key_session: false, pillar: 'Durability', optional: false, slot: null, ...META,
      parts: [{ format: 'Strength', template_id: 'STR-45', run_type: null, minutes: 30, items: [item('SQ', `3 × ${reps}, hard with intent: 1–2 good reps left`), item('PU', `3 × ${reps}, bodyweight, hard with intent`)] }] },
    { day: 'Wed', title: 'Compromised + Tabata', key_session: true, pillar: 'Threshold', optional: false, slot: null, ...META,
      parts: [
        { format: 'Compromised', template_id: null, run_type: null, minutes: 20, items: [item('RUN', '400 m run, RPE 8', { run_minutes: 5 }), item('WB', `${reps * 3} wall balls`)] },
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
    // A 4-week program: a 2-week taper (race week + 1 week).
    phases: [{ name: 'Base', kind: 'base', start_week: 1, end_week: 2, purpose: 'p' }, { name: 'Taper', kind: 'taper', start_week: 3, end_week: 4, purpose: 'p' }],
    weeks: [1, 2, 3, 4].map((w) => ({
      week: w, phase: w >= 3 ? 'taper' : 'base', focus: 'f', load: 'Moderate', deload: w === 4,
      lever: w === 1 ? 'start' : w >= 3 ? 'deload' : 'volume', core_sessions: w === 4 ? 2 : 3, strength_sessions: 1, optional_sessions: 1,
      key_session: 'Circuit + Tabata', key_sessions: ['k'], pillars: ['Aerobic Engine'],
    })),
  } as Outline;
}

// The block is weeks 1–4 of a 12-week program (no taper or race week in it). The
// deload week (4) drops Monday's strength session, so it has none.
const BLOCK_OUTLINE_WEEKS = outline().weeks.map((w) => ({ ...w, phase: 'base' as const, lever: w.week === 3 ? 'volume' as const : w.lever, strength_sessions: w.week === 4 ? 0 : 1 }));
const OUTLINE_CTX = { running: 'none' as const, strengthPref: 1, raceDay: 'Sat' };

const ctx: BlockContext = {
  startWeek: 1, endWeek: 4, outlineWeeks: BLOCK_OUTLINE_WEEKS, trainingDays: ['Mon', 'Wed', 'Fri', 'Sat'], canDouble: 'no', strengthPref: 1,
  strengthPlacement: 'own_days', raceDay: 'Sat', keySessionDay: 'Wed',
  minutesPerSession: 45, frame: { warmup_min: 10, cooldown_min: 5 }, candidates, timings,
  settings: { minutesTolerance: 5, deloadMin: 0.6, deloadMax: 0.7, deloadSessionMinRatio: 0.5, runShareMax: 0.25 },
  availableFormats: ALL_FORMATS, running: 'own_plan', ownRuns: [], longestRunMin: null, previousLongRunMin: null, finalWeek: 12,
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
  assert.deepEqual(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }), []);
  const o = outline();
  o.weeks[1].lever = 'start';
  assert.match(validateOutline(o, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /must progress one lever/);
  const d = outline();
  d.weeks[3].lever = 'volume';
  assert.match(validateOutline(d, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /Week 4 is a taper week, so its lever must be "deload"/);
  // A taper week that isn't flagged as a deload still cuts volume: lever "deload", and that is valid.
  const t = outline();
  t.weeks[3].deload = false;
  assert.doesNotMatch(validateOutline(t, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /Week 4/);
  t.weeks[3].lever = 'intensity';
  assert.match(validateOutline(t, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /Week 4 is a taper week, so its lever must be "deload"/);
  assert.match(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 1, ...OUTLINE_CTX }).join(' '), /between 1 and 2 \(1 training days, up to 2 sessions a day\)/);
  // A frequency week must plan an extra session.
  const f = outline();
  f.weeks[1].lever = 'frequency';
  assert.match(validateOutline(f, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /Week 2 uses the frequency lever, so it adds a session/);
  f.weeks[1].optional_sessions = 2;
  assert.doesNotMatch(validateOutline(f, { totalWeeks: 4, daysAvailable: 4, ...OUTLINE_CTX }).join(' '), /frequency lever/);
});

Deno.test('validateBlock: a good block passes', () => {
  assert.deepEqual(validateBlock(block(), ctx), []);
});

Deno.test('days, key session and session length', () => {
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].day = 'Tue'; }), /isn't one of the athlete's training days/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].day = 'Mon'; }), /order_in_day 1 and 2/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].key_session = false; }), /exactly one core session as the key session/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[1].minutes = 25; }), /lasts 55 min; sessions must be 45 min/);
});

Deno.test('progression: unchanged sessions, frequency and deload size', () => {
  assert.match(errorsFor((b) => { b.weeks[1] = { ...week(1, 8), week: 2, progression: { lever: 'volume', change: 'c' } }; }), /repeats a session from the week before unchanged/);
  assert.match(errorsFor((b) => { b.weeks[1].progression.lever = 'intensity'; }), /the outline's lever is "volume"/);
  // Deload with all three core sessions is 100% of the week before.
  assert.match(errorsFor((b) => { b.weeks[3] = { ...week(4, 7), progression: { lever: 'deload', change: 'c' } }; }), /deload week should be about 60–70%/);
});

Deno.test('unchanged repeats: only quality sessions must progress', () => {
  const repeat = (mutate: (w: BlockWeek) => void) => errorsFor((b) => {
    const w2: BlockWeek = { ...week(1, 8), week: 2, progression: { lever: 'volume', change: 'c' } };
    mutate(w2);
    b.weeks[1] = w2;
  });
  // Friday's bike session repeated unchanged: flagged while it's a quality session…
  assert.match(repeat(() => {}), /"Bike" repeats a session from the week before unchanged/);
  // …but easy, recovery, maintain and optional sessions may repeat.
  assert.doesNotMatch(repeat((w) => { w.sessions[2].session_type = 'easy_steady'; }), /"Bike" repeats/);
  assert.doesNotMatch(repeat((w) => { w.sessions[2].session_type = 'recovery'; }), /"Bike" repeats/);
  assert.doesNotMatch(repeat((w) => { w.sessions[0].build_or_maintain = 'maintain'; w.sessions[0].parts[0].items.forEach((it) => { it.dose = '2 × 8, hard with intent'; }); }), /"Strength" repeats/);
  assert.doesNotMatch(repeat(() => {}), /"Compromised" repeats/); // Saturday's optional session
});

Deno.test('beginners: strength as the second session on quality days, other days for conditioning', () => {
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  const beginner: BlockContext = { ...ctx, beginner: true };
  // Monday strength alone (own_days would allow it); for a beginner it belongs after a quality session.
  assert.match(week2(validateBlock(block(), beginner)), /strength goes on hard days first|for beginners, strength is the second session on a quality day/);
  // Outline: a run or conditioning session on every training day, plus the strength sessions.
  const o = outline();
  for (const w of o.weeks) w.strength_sessions = w.week >= 3 ? 1 : 2;
  assert.match(validateOutline(o, { totalWeeks: 4, daysAvailable: 3, running: 'none', strengthPref: 2, raceDay: 'Sat', beginner: true }).join(' '),
    /plan at least 5 core sessions .*beginners: a run or conditioning session on every training day/);
});

Deno.test('formats: templates, Tabata, HIIT, doses and units', () => {
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].template_id = null; }), /Strength parts need a template/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].items.reverse(); }), /doesn't fit slot "Squat"/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].parts[1].items[0].exercise_id = 'DL'; }), /DL is not Tabata-suitable/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[1].parts[1].items.forEach((it) => { it.block = 1; }); }), /Tabata block 1 needs 1 exercise, or 2 alternating; it has 3.*Tabata block 2 needs 1 exercise, or 2 alternating; it has 0/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[2].parts[0].items[0].dose = '12 reps'; }), /HIIT is timed, so the dose is time only/);
  assert.match(errorsFor((b) => { b.weeks[0].sessions[0].parts[0].items[0].dose = '3 sets, RPE 7'; }), /strength is dosed as working sets × reps plus the intent/);
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
  // Steady aerobic work needs an erg or walking.
  const noErgs = { ...candidates, exercises: new Map([...candidates.exercises].filter(([id]) => id !== 'BIKE')) };
  assert.equal(availableFormats(noErgs, 'none').has('Aerobic'), true); // the brisk walk
  const noErgsOrWalks = { ...candidates, exercises: new Map([...candidates.exercises].filter(([id]) => id !== 'BIKE' && id !== 'WALK')) };
  assert.equal(availableFormats(noErgsOrWalks, 'none').has('Aerobic'), false);
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
  const programmed: BlockContext = { ...ctx, running: 'programmed', keySessionDay: 'Fri' };
  // 3 core sessions: needs a key run, strength, hybrid. Friday's interval run becomes the key session.
  const withKeyRun = (b: Block) => {
    for (const w of b.weeks) {
      const fri = w.sessions.find((x) => x.day === 'Fri');
      if (!fri) continue;
      fri.parts = [run('key', 30, `3 × 8 min @ RPE 8-8.5 / 2 min easy, week ${w.week}`)];
      fri.key_session = true;
      for (const x of w.sessions) if (x !== fri) x.key_session = false;
    }
  };
  const good = block();
  withKeyRun(good);
  assert.deepEqual(validateBlock(good, programmed), []);
  assert.match(validateBlock(block(), programmed).join(' '), /key run/);
  // The key session must be the interval run, at RPE 8+.
  const easyKey = block();
  withKeyRun(easyKey);
  easyKey.weeks[1].sessions[2].parts[0].items[0].dose = '30 min @ RPE 6-7 Steady';
  assert.match(validateBlock(easyKey, programmed).join(' '), /Week 2: the key session "Bike" is the main interval session at RPE 8 or more/);
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
  assert.match(validateBlock(block(), own).join(' '), /"Strength" on Mon has heavy lower-body work the day before the athlete's hard run on Tue; make it upper body \+ core/);
  assert.deepEqual(validateBlock(block(), { ...own, ownRuns: [{ day: 'Tue', intensity: 'easy' }] }), []);
});

Deno.test('interference (all athletes): not the day before a key or long run, not a PM session two days before', () => {
  const run = (type: string, minutes: number, dose: string) =>
    ({ format: 'Run' as const, template_id: null, run_type: type as 'key', minutes, items: [item('RUN', dose)] });
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  const programmed: BlockContext = { ...ctx, running: 'programmed', keySessionDay: 'Wed', trainingDays: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'] };
  // Key run on Wednesday: Tuesday's squat strength is the day before.
  const b = block();
  b.weeks[1].sessions[1].parts = [run('key', 30, '3 × 8 min @ RPE 8-8.5 / 2 min easy, week 2')];
  b.weeks[1].sessions[0].day = 'Tue';
  assert.match(week2(validateBlock(b, programmed)), /"Strength" on Tue has heavy lower-body work the day before the key run on Wed; make it upper body \+ core/);
  // Monday as the first session of the day (two days before): allowed…
  b.weeks[1].sessions[0].day = 'Mon';
  assert.doesNotMatch(week2(validateBlock(b, programmed)), /heavy lower-body/);
  // …but not as a second (PM) session two days before.
  b.weeks[1].sessions[0].order_in_day = 2;
  assert.match(week2(validateBlock(b, programmed)), /"Strength" on Mon \(second session\) has heavy lower-body work two days before the key run on Wed/);
  // Upper body + core only: fine the day before.
  const upper = block();
  upper.weeks[1].sessions[1].parts = [run('key', 30, '3 × 8 min @ RPE 8-8.5 / 2 min easy, week 2')];
  upper.weeks[1].sessions[0].day = 'Tue';
  upper.weeks[1].sessions[0].parts[0].items = upper.weeks[1].sessions[0].parts[0].items.map((it) => ({ ...it, exercise_id: 'PU' }));
  assert.doesNotMatch(week2(validateBlock(upper, programmed)), /heavy lower-body/);
});

Deno.test('two sessions a day: order_in_day, can_double, strength never inside a run session', () => {
  const pm = (b: Block) => {
    const s = structuredClone(b.weeks[1].sessions[0]); // Monday strength, moved to Wednesday PM
    s.day = 'Wed'; s.order_in_day = 2; s.optional = true; s.slot = 'pm-strength'; s.title = 'PM strength';
    b.weeks[1].sessions.push(s);
  };
  assert.doesNotMatch(errorsFor(pm), /order_in_day|twice a day|at most 2/);
  assert.match(errorsFor((b) => { pm(b); b.weeks[1].sessions.at(-1)!.order_in_day = 1; }), /order_in_day 1 and 2/);
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].order_in_day = 2; }), /only session on Mon, so order_in_day is 1/);
  // Two conditioning sessions on one day: only allowed when the athlete can double.
  const conditioningDouble = (b: Block) => {
    const s = structuredClone(b.weeks[1].sessions[2]); // Friday bike
    s.day = 'Wed'; s.order_in_day = 2; s.optional = true; s.slot = 'pm-bike'; s.title = 'PM bike';
    b.weeks[1].sessions.push(s);
  };
  assert.match(errorsFor(conditioningDouble), /can't train twice a day/);
  const b = block(); conditioningDouble(b);
  assert.doesNotMatch(validateBlock(b, { ...ctx, canDouble: 'yes' }).join(' '), /twice a day/);
  // Strength inside a run session.
  assert.match(errorsFor((b) => {
    b.weeks[1].sessions[0].parts.push({ format: 'Run', template_id: null, run_type: 'easy', minutes: 5, items: [item('RUN', '5 min @ RPE 5–6 · Easy')] });
  }), /strength is its own session/);
});

Deno.test('strength: working sets, reps, no RPE number, exercise groups; easy days stay easy', () => {
  const dose = (d: string) => errorsFor((b) => { b.weeks[1].sessions[0].parts[0].items[0].dose = d; });
  assert.doesNotMatch(dose('3 sets (2–3) × 6–8, hard with intent: finish with 1–2 good reps left'), /working sets|reps;|RPE number/);
  assert.match(dose('4 × 8, hard with intent'), /2–3 working sets/);
  assert.match(dose('3 × 12, hard with intent'), /6–10 reps/);
  assert.match(dose('3 × 8, hard with intent, RPE 8'), /not an RPE number/);
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].build_or_maintain = 'maintain'; }), /1–2 working sets to maintain/);
  assert.match(errorsFor((b) => {
    const items = b.weeks[1].sessions[0].parts[0].items;
    items.push(...Array.from({ length: 8 }, () => ({ ...items[0] })));
  }), /at most 4 exercise groups/);
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].session_type = 'easy_steady'; }), /Strength part on Mon, an easy day/);
  // The athlete's own easy run day.
  assert.match(validateBlock(block(), { ...ctx, running: 'own_plan', ownRuns: [{ day: 'Mon', intensity: 'easy' }] }).join(' '), /Strength part on Mon, an easy day \(their own easy run\)/);
});

Deno.test('strength sessions follow the athlete\'s choice; extras on easy days only beyond the hard days', () => {
  assert.deepEqual(weeklyNeeds('none', 3, 2), ['strength', 'strength', 'hybrid or station']);
  const t = (week: number, phase: 'base' | 'taper', core: number, pref: number, raceDay = 'Sat') =>
    strengthTarget({ week, phase, core_sessions: core }, { running: 'none', strengthPref: pref, finalWeek: 12, raceDay });
  assert.equal(t(1, 'base', 3, 2), 2);
  assert.equal(t(1, 'base', 3, 6), 2); // capped by the sessions left after the hybrid need
  assert.equal(t(11, 'taper', 5, 4), 1); // taper: 1
  assert.equal(t(12, 'taper', 3, 4), 1); // race on Saturday: Monday is 5 days before
  assert.equal(t(12, 'taper', 3, 4, 'Thu'), 0); // race on Thursday: no day fits
  assert.equal(strengthTarget({ week: 1, phase: 'base', core_sessions: 6 }, { running: 'programmed', strengthPref: 3, finalWeek: 12, raceDay: 'Sat' }), 3);
  // The block follows the outline's strength_sessions.
  const two = BLOCK_OUTLINE_WEEKS.map((w) => ({ ...w, strength_sessions: w.week === 4 ? 0 : 2 }));
  assert.match(validateBlock(block(), { ...ctx, outlineWeeks: two }).join(' '), /2 core strength sessions this week \(the outline's strength_sessions\); the block has 1/);

  // Monday strength beside an easy session: rejected at 1 strength session (3 hard days), allowed at 4.
  const easyMon = (b: Block) => {
    const s = structuredClone(b.weeks[1].sessions[2]); // Friday bike, as an easy Monday AM session
    s.day = 'Mon'; s.order_in_day = 1; s.optional = true; s.slot = 'easy-am'; s.session_type = 'easy_steady'; s.title = 'Easy bike';
    b.weeks[1].sessions[0].order_in_day = 2;
    b.weeks[1].sessions.push(s);
  };
  const b1 = block(); easyMon(b1);
  assert.match(validateBlock(b1, ctx).join(' '), /Strength part on Mon, an easy day \("Easy bike"\); strength goes on hard days \(3 this week/);
  const four = BLOCK_OUTLINE_WEEKS.map((w) => ({ ...w, strength_sessions: 4 }));
  assert.doesNotMatch(validateBlock(b1, { ...ctx, outlineWeeks: four }).join(' '), /easy day/);
  // A recovery day never gets strength, whatever the choice.
  const b2 = block(); easyMon(b2); b2.weeks[1].sessions.at(-1)!.session_type = 'recovery';
  assert.match(validateBlock(b2, { ...ctx, strengthPref: 6 }).join(' '), /Strength part on Mon, a recovery day/);
});

Deno.test('parseInputs: off-feet choices (Q2c) and Hyathlon races done (Q1d)', () => {
  assert.deepEqual(parseInputs({ ...baseInputs, off_feet_includes: ['bike', 'simulations'] }).off_feet_includes, ['simulations', 'bike']);
  assert.equal(parseInputs(baseInputs).off_feet_includes, null);
  assert.throws(() => parseInputs({ ...baseInputs, off_feet_includes: ['swim'] }), /Off-feet choices/);
  assert.equal(parseInputs({ ...baseInputs, hyathlon_races_count: '3_5' }).hyathlon_races_count, '3_5');
  assert.throws(() => parseInputs({ ...baseInputs, hyathlon_races_count: 'lots' }), /Hyathlon races done/);
});

Deno.test('parseInputs: limiters and strength sessions a week (onboarding 3b, 10d)', () => {
  assert.equal(parseInputs(baseInputs).strength_sessions_pref, 2);
  assert.equal(parseInputs({ ...baseInputs, limiters: ['strength_endurance'] }).strength_sessions_pref, 3);
  assert.equal(parseInputs({ ...baseInputs, limiters: ['strength_endurance'], strength_sessions_pref: 5 }).strength_sessions_pref, 5);
  assert.throws(() => parseInputs({ ...baseInputs, strength_sessions_pref: 7 }), /2 to 6/);
  assert.throws(() => parseInputs({ ...baseInputs, limiters: ['running', 'strength', 'aerobic_fitness'] }), /up to 2/);
  assert.throws(() => parseInputs({ ...baseInputs, limiters: ['speed'] }), /Limiters must be/);
});

Deno.test('strength placement: with_hard_sessions, own_days, short second sessions, race week', () => {
  // A mobility-only second session is not a strength session.
  const mob = block();
  mob.weeks[1].sessions.push({ ...structuredClone(mob.weeks[1].sessions[2]), day: 'Fri', order_in_day: 2, title: 'Mobility', optional: true, slot: 'mob',
    parts: [{ format: 'Mobility', template_id: null, run_type: null, minutes: 10, items: [item('CORE', '10 min easy')] }] });
  assert.doesNotMatch(validateBlock(mob, ctx).join(' '), /"Mobility".*30- or 45-min Strength template/);
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  // with_hard_sessions: Monday's strength sits alone while Wednesday and Friday (hard days) have room.
  const hardFirst: BlockContext = { ...ctx, strengthPlacement: 'with_hard_sessions' };
  assert.match(week2(validateBlock(block(), hardFirst)), /strength goes on hard days first .*Wed, Fri have room, but "Strength" is on Mon/);
  // Moved to Wednesday as the day's second session (a 45-min template, its own warm-up): fine.
  const moved = block();
  const str = moved.weeks[1].sessions[0];
  str.day = 'Wed'; str.order_in_day = 2;
  assert.equal(week2(validateBlock(moved, hardFirst)), '');
  // Strength first, hard session second: wrong order.
  str.order_in_day = 1; moved.weeks[1].sessions[1].order_in_day = 2;
  assert.match(week2(validateBlock(moved, hardFirst)), /goes after "Compromised \+ Tabata" on Wed/);
  // A second-of-day strength session that isn't one short template.
  const long = block();
  const ls = long.weeks[1].sessions[0];
  ls.day = 'Wed'; ls.order_in_day = 2; ls.parts = [ls.parts[0], structuredClone(ls.parts[0])];
  assert.match(week2(validateBlock(long, hardFirst)), /day's second session is one 30- or 45-min Strength template/);

  // own_days: Thursday strength is the day after Wednesday's key session and before Friday's hard session.
  const thu = block();
  thu.weeks[1].sessions[0].day = 'Thu';
  const ownDays = week2(validateBlock(thu, { ...ctx, trainingDays: ['Mon', 'Wed', 'Thu', 'Fri', 'Sat'] }));
  assert.match(ownDays, /the day after a key session \(Wed\)/);
  assert.match(ownDays, /followed by a hard day \(Fri\)/);

  // Race week (week 2 here): maintain, and at least 5 days before the race.
  assert.match(week2(validateBlock(block(), { ...ctx, finalWeek: 2 })), /strength in deload, taper and race weeks is maintain/);
  assert.match(week2(validateBlock(block(), { ...ctx, finalWeek: 2, raceDay: 'Thu' })), /at least 5 days before the race \(no day fits\)/);
});

Deno.test('outline strength_sessions: the choice in normal weeks, 1 + 1 optional in deloads, 0 for own or none', () => {
  const o = outline();
  const oc = { totalWeeks: 4, daysAvailable: 4, running: 'none' as const, strengthPref: 2, raceDay: 'Sat' };
  for (const w of o.weeks) w.strength_sessions = w.week >= 3 ? 1 : 2; // 3 core: hybrid + 2 strength
  assert.deepEqual(validateOutline(o, oc), []);
  o.weeks[1].strength_sessions = 1;
  assert.match(validateOutline(o, oc).join(' '), /Week 2: strength_sessions must be 2/);
  // A deload week: 1 core strength session plus 1 optional (so at least 1 optional session).
  const d = { ...o, weeks: o.weeks.map((w) => ({ ...w })) };
  d.weeks[1] = { ...d.weeks[1], deload: true, lever: 'deload', strength_sessions: 1, optional_sessions: 1 };
  assert.doesNotMatch(validateOutline(d, oc).join(' '), /Week 2: (strength_sessions|a deload week)/);
  d.weeks[1] = { ...d.weeks[1], strength_sessions: 2, optional_sessions: 0 };
  assert.match(validateOutline(d, oc).join(' '), /Week 2: strength_sessions must be 1 \(deload/);
  assert.match(validateOutline(d, oc).join(' '), /Week 2: a deload week has 1 optional strength session/);
  // Own strength or none: no programmed strength.
  assert.match(validateOutline(o, { ...oc, strengthChoice: 'own' }).join(' '), /strength_sessions must be 0 \(the athlete does their own strength or none\)/);
  // Too few core sessions for the choice.
  o.weeks[1] = { ...o.weeks[1], strength_sessions: 1, core_sessions: 2 };
  assert.match(validateOutline(o, { ...oc, strengthPref: 2 }).join(' '), /Week 2: plan at least 3 core sessions/);
});

Deno.test('key session: a real quality session', () => {
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  // Station skill, easy or recovery sessions are never the key session.
  assert.match(errorsFor((b) => { b.weeks[1].sessions[1].session_type = 'station_skill'; }), /the key session "Compromised \+ Tabata" is station skill; the key session is a quality session/);
  assert.match(errorsFor((b) => { b.weeks[1].sessions[1].session_type = 'easy_steady'; }), /is easy steady/);
  // No running programmed: a hard strength session, race simulation or compromised session.
  // Steady erg work isn't a key session…
  const erg = block();
  erg.weeks[1].sessions[1].parts = [{ format: 'Aerobic', template_id: null, run_type: null, minutes: 30, items: [item('BIKE', 'steady, RPE 6-7')] }];
  assert.match(week2(validateBlock(erg, ctx)), /without programmed running, the key session is a hard strength session, an off-feet interval session at RPE 8\+, a race simulation, a compromised session or a hard AMRAP\/EMOM-type workout/);
  // …but off-feet intervals at RPE 8+ are (no running at all: off-feet only).
  const intervals = block();
  intervals.weeks[1].sessions[1].parts = structuredClone(intervals.weeks[1].sessions[2].parts);
  assert.doesNotMatch(week2(validateBlock(intervals, ctx)), /key session/);
  // A hard strength session can be the key session, alone on its day.
  const strengthKey = block();
  strengthKey.weeks[1].sessions[0].key_session = true;
  strengthKey.weeks[1].sessions[1].key_session = false;
  assert.doesNotMatch(week2(validateBlock(strengthKey, { ...ctx, keySessionDay: 'Mon' })), /key session/);
  // Core/mobility as the main session: only in a taper or post-event week.
  const core = block();
  core.weeks[1].sessions[1].parts = [{ format: 'Tabata', template_id: null, run_type: null, minutes: 30, items: [item('CORE', 'max effort', { block: 1 })] }];
  assert.match(week2(validateBlock(core, ctx)), /is core\/mobility work; that is only the week's main session in a taper or post-event week/);
  assert.doesNotMatch(week2(validateBlock(core, { ...ctx, postEventWeeks: [2] })), /core\/mobility/);
});

Deno.test('starting running level and the first interval week (07 §1, §4)', () => {
  const r = (longest: number | null, exp?: 'yes' | 'no', mode: 'programmed' | 'none' = 'programmed') =>
    ({ running: { mode, own_runs: [] }, longest_run_min: longest, interval_experience: exp ?? null });
  assert.deepEqual([runningLevel(r(0)), runningLevel(r(15)), runningLevel(r(20)), runningLevel(r(30, 'yes', 'none'))],
    ['beginner_1', 'beginner_2', 'normal', null]);
  // "Not sure": the follow-up "Can you run 20 minutes without stopping?" decides.
  assert.equal(runningLevel({ ...r(null), can_run_20_min: 'yes' }), 'normal');
  assert.equal(runningLevel({ ...r(null), can_run_20_min: 'no' }), 'beginner_2');
  assert.equal(runningLevel(r(null)), 'beginner_2');
  assert.equal(intervalIntroWeek(r(45, 'yes')), 2);
  assert.equal(intervalIntroWeek(r(45, 'no')), 3);
  assert.equal(intervalIntroWeek(r(45)), 3); // not said: treated as no
  assert.equal(intervalIntroWeek(r(15, 'yes')), 6); // after the 4-week bridge
  assert.equal(intervalIntroWeek(r(0, 'yes')), null); // walk–run first
  assert.equal(parseInputs({ ...baseInputs, interval_experience: 'yes' }).interval_experience, 'yes');
  assert.throws(() => parseInputs({ ...baseInputs, interval_experience: 'maybe' }), /Interval experience/);
});

Deno.test('before the first interval session the key session is the main aerobic run; running beginners', () => {
  const run = (type: string, minutes: number, dose: string) =>
    ({ format: 'Run' as const, template_id: null, run_type: type as 'key', minutes, items: [item('RUN', dose)] });
  const programmed: BlockContext = { ...ctx, running: 'programmed', keySessionDay: 'Fri' };
  const aerobicKey = block();
  for (const w of aerobicKey.weeks) {
    const fri = w.sessions.find((x) => x.day === 'Fri');
    if (!fri) continue;
    fri.parts = [run('key', 30, `30 min @ RPE 6-8 Steady with 5 × 30 s efforts, week ${w.week}`)];
    fri.session_type = 'easy_steady';
    fri.key_session = true;
    for (const x of w.sessions) if (x !== fri) x.key_session = false;
  }
  const week = (errs: string[], n: number) => errs.filter((e) => e.startsWith(`Week ${n}`)).join(' | ');
  // Intervals start in week 3: weeks 1–2 may have an aerobic key run; week 3 needs RPE 8+.
  const errs = validateBlock(aerobicKey, { ...programmed, intervalIntroWeek: 3 });
  assert.doesNotMatch(week(errs, 1) + week(errs, 2), /key session/);
  assert.match(week(errs, 3), /key session "Bike" is easy steady|main interval session at RPE 8 or more/);
  // Walk–run beginners: no interval week yet.
  assert.doesNotMatch(validateBlock(aerobicKey, { ...programmed, intervalIntroWeek: null }).join(' '), /key session/);
  // Running beginners: never 3 days in a row; the day after the long run is easy.
  const b3 = block();
  b3.weeks[1].sessions[2].day = 'Tue'; // Mon, Tue, Wed
  assert.match(week(validateBlock(b3, { ...ctx, runningBeginner: true, trainingDays: ['Mon', 'Tue', 'Wed', 'Sat'] }), 2), /never train 3 days in a row \(Mon–Wed\)/);
  const lr = block();
  lr.weeks[1].sessions[2].parts = [run('long', 30, '30 min @ RPE 6-8 Steady, week 2')]; // Friday long run, Saturday compromised after it
  assert.match(week(validateBlock(lr, { ...programmed, runningBeginner: true }), 2), /the day after the long run \(Sat\) is the absorption run or cross-training/);
});

Deno.test('race week: strength moves to at least 5 days before the race, in code', () => {
  // Week 2 as race week, race on Saturday: only Monday qualifies.
  const b = block();
  const w = b.weeks[1];
  w.sessions[0].day = 'Wed'; // strength moved off Monday, beside the key session
  w.sessions[0].order_in_day = 2;
  const note = placeRaceWeekStrength(w, { finalWeek: 2, raceDay: 'Sat', trainingDays: ctx.trainingDays });
  assert.equal(note, 'race-week strength moved: "Strength" Wed → Mon');
  assert.deepEqual([w.sessions[0].day, w.sessions[0].order_in_day, w.sessions[1].order_in_day], ['Mon', 1, 1]);
  // Not race week, or no allowed training day: nothing moves.
  assert.equal(placeRaceWeekStrength(block().weeks[1], { finalWeek: 12, raceDay: 'Sat', trainingDays: ctx.trainingDays }), null);
  const thu = block().weeks[1];
  thu.sessions[0].day = 'Wed';
  assert.equal(placeRaceWeekStrength(thu, { finalWeek: 2, raceDay: 'Thu', trainingDays: ctx.trainingDays }), null);
});

Deno.test('long-run plan: bands to 80 min, then LR 1–7b one step a week', () => {
  const weeks = [1, 2, 3, 4, 5, 6].map((w) => ({ week: w, phase: w === 6 ? 'taper' as const : 'build' as const, deload: w === 4, lever: w === 1 ? 'start' as const : w === 4 ? 'deload' as const : 'volume' as const }));
  const plan = longRunPlan(62, false, weeks, 7);
  assert.deepEqual([...plan.values()].map((t) => t.label), ['Band 60–70', 'Band 70–80', 'LR 1', 'LR 1 (lighter)', 'LR 2', 'Taper']);
  // Non-advanced runners stop at LR 4 (90 min); advanced continue to LR 5–7b.
  const long = Array.from({ length: 10 }, (_, i) => ({ week: i + 1, phase: 'build' as const, deload: false, lever: i === 0 ? 'start' as const : 'volume' as const }));
  assert.equal([...longRunPlan(85, false, long, 20).values()].at(-1)!.label, 'LR 4');
  assert.equal([...longRunPlan(85, true, long, 20).values()].at(-1)!.label, 'LR 7b');
  // Short longest runs (or none): no stage plan; the +10 min rule and beginner progressions apply.
  assert.equal(longRunPlan(30, false, weeks, 7).size, 0);
  assert.equal(longRunPlan(null, false, weeks, 7).size, 0);
});

Deno.test('long runs: minutes per stage and cap; base effort by level', () => {
  const run = (minutes: number, dose: string) => ({ format: 'Run' as const, template_id: null, run_type: 'long' as 'key', minutes, items: [item('RUN', dose)] });
  const programmed: BlockContext = { ...ctx, running: 'programmed' };
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  const withLong = (minutes: number, dose: string) => { const b = block(); b.weeks[1].sessions[3].parts = [run(minutes, dose)]; return b; };
  // RPE 6–8 Steady is no longer a long-run base effort for beginner–intermediate runners.
  assert.match(week2(validateBlock(withLong(30, '30 min @ RPE 6-8 Steady'), programmed)), /long run's base effort is RPE 5–6 · Easy/);
  assert.doesNotMatch(week2(validateBlock(withLong(30, '30 min @ RPE 5-6 Easy, 4 × 5 min at RPE 8-8.5'), programmed)), /base effort|segments go up/);
  assert.doesNotMatch(week2(validateBlock(withLong(30, '30 min @ RPE 6-7 Steady'), { ...programmed, advancedRunner: true })), /base effort/);
  assert.match(week2(validateBlock(withLong(30, '30 min easy'), programmed)), /give the long run's effort as RPE/);
  // Over 90 min is for advanced runners; the week's stage sets the minutes.
  assert.match(week2(validateBlock(withLong(100, '100 min @ RPE 5-6 Easy'), programmed)), /at most 90 min \(90–120 min is for advanced runners\)/);
  const plan = new Map([[2, { label: 'LR 4', minutes: [85, 90] as [number, number] }]]);
  assert.match(week2(validateBlock(withLong(60, '60 min @ RPE 5-6 Easy'), { ...programmed, longRunPlan: plan })), /this week's long run is LR 4, 85–90 min; it is 60 min/);
});

Deno.test('taper volume: Hyathlon ~50% of usual (down 40–60%) the week before race week', () => {
  assert.deepEqual([taperTarget(10, 12), taperTarget(11, 12)], [0.5, 0.5]);
  const b = block();
  const outlineWeeks = BLOCK_OUTLINE_WEEKS.map((w) => ({ ...w, phase: w.week === 3 ? 'taper' as const : w.phase }));
  // Week 3 as the week before race week (finalWeek 4): target ~60% of usual (week 2, the last normal week). Unchanged it's 100%.
  b.weeks[2].progression.lever = 'deload';
  const errs = validateBlock(b, { ...ctx, outlineWeeks: outlineWeeks.map((w) => (w.week === 3 ? { ...w, lever: 'deload' as const } : w)), finalWeek: 4 });
  assert.match(errs.join(' '), /Week 3: this taper week should be about 50% of usual volume \(week 2's core minutes\); it is 100%/);
});

Deno.test('no running is off-feet only; off-feet choices; compromised runs use the athlete\'s sessions', () => {
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  const none: BlockContext = { ...ctx, running: 'none', ownRuns: [] };
  // The fixture's compromised parts have runs: not for an off-feet athlete.
  assert.match(week2(validateBlock(block(), none)), /chose no running \(off-feet only\); replace the run segment with their preferred erg or bike/);
  // Bike sessions only if chosen.
  assert.match(week2(validateBlock(block(), { ...none, offFeetIncludes: ['erg'] })), /didn't choose bike sessions/);
  // CompromisedRun: one of the athlete's compromised sessions, stations from its movement patterns.
  const cr = block();
  cr.weeks[1].sessions[1].parts[0] = { format: 'CompromisedRun', template_id: 'CR-S5', run_type: null, minutes: 20,
    items: [item('RUN', '500 m race effort, RPE 8-8.5'), item('WB', '30 s wall balls, load by feel'), item('RUN', '500 m race effort, RPE 8-8.5')] };
  assert.doesNotMatch(week2(validateBlock(cr, ctx)), /compromised run|CR-S5|unknown format/);
  cr.weeks[1].sessions[1].parts[0].items[1].exercise_id = 'SQ';
  assert.match(week2(validateBlock(cr, ctx)), /CR-S5 \(Fatigue Sandwich\) uses Med ball \/ throw, Lunge \/ single-leg; SQ is Squat/);
  cr.weeks[1].sessions[1].parts[0].template_id = 'CR-E1';
  assert.match(week2(validateBlock(cr, ctx)), /uses one of the athlete's compromised sessions \(template_id CR-S5\)/);
});

Deno.test('race week (running programs): the key session is a short sharpener 4–5 days out; other runs easy', () => {
  const run = (type: string, minutes: number, dose: string) => ({ format: 'Run' as const, template_id: null, run_type: type as 'key', minutes, items: [item('RUN', dose)] });
  const programmed: BlockContext = { ...ctx, running: 'programmed', finalWeek: 2, raceDay: 'Sat', outlineWeeks: BLOCK_OUTLINE_WEEKS.map((w) => ({ ...w, strength_sessions: w.week === 2 ? 0 : w.strength_sessions })) };
  const week2 = (errs: string[]) => errs.filter((e) => e.startsWith('Week 2')).join(' | ');
  const b = block();
  const w = b.weeks[1];
  w.sessions = w.sessions.filter((s) => s.day !== 'Mon'); // no strength in this race week
  const key = w.sessions.find((s) => s.key_session)!;
  key.parts = [run('key', 15, '15 min just slower than race effort, RPE 8')];
  key.day = 'Mon';
  assert.doesNotMatch(week2(validateBlock(b, programmed)), /sharpener|key session must be on/);
  key.day = 'Wed';
  assert.match(week2(validateBlock(b, programmed)), /at least 4–5 days before the race \(Mon or Tue\); it is on Wed/);
  key.day = 'Mon';
  key.parts = [run('key', 15, '15 min @ RPE 9')];
  assert.match(week2(validateBlock(b, programmed)), /15 min just slower than race effort \(RPE 8\)/);
  key.parts = [run('key', 15, '15 min just slower than race effort, RPE 8')];
  w.sessions.find((s) => s.day === 'Fri')!.parts = [run('long', 60, '60 min @ RPE 5-6 Easy')];
  assert.match(week2(validateBlock(b, programmed)), /in race week, runs other than the sharpener are easy \(no long run\)/);
});

Deno.test('Hyathlon taper is race week + 1; station skill never alone; titles name what is in the session', () => {
  assert.deepEqual([taperWeeks(16), taperWeeks(12), taperWeeks(4)], [2, 2, 2]);
  // Marathon and half marathon (running-race goals, later): by program length.
  assert.deepEqual([taperWeeks(16, 'marathon'), taperWeeks(12, 'marathon'), taperWeeks(8, 'marathon'), taperWeeks(5, 'marathon')], [3, 3, 2, 2]);
  assert.deepEqual([taperWeeks(6, 'half_marathon'), taperWeeks(8, 'half_marathon')], [1, 2]);
  // A 12-week program whose taper is only race week: week 11 must be taper too.
  const twelve = { summary: 's', phases: [{ name: 'Base', kind: 'base', start_week: 1, end_week: 11, purpose: 'p' }, { name: 'Taper', kind: 'taper', start_week: 12, end_week: 12, purpose: 'p' }],
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, phase: i === 11 ? 'taper' : 'base', focus: 'f', load: 'Moderate', deload: false,
      lever: i === 0 ? 'start' : i === 11 ? 'deload' : 'volume', core_sessions: 3, strength_sessions: 1, optional_sessions: 1, key_session: 'k', key_sessions: ['k'], pillars: ['Aerobic Engine'] })) } as Outline;
  const errs = validateOutline(twelve, { totalWeeks: 12, daysAvailable: 4, ...OUTLINE_CTX }).join(' ');
  assert.match(errs, /Week 11 is in the 2-week taper \(a 12-week program\), so its phase is taper/);
  assert.doesNotMatch(errs, /Week 10 is in the/);
  // Station skill on its own on a day.
  const week2 = (e: string[]) => e.filter((x) => x.startsWith('Week 2')).join(' | ');
  const skill = block();
  skill.weeks[1].sessions[2].session_type = 'station_skill';
  assert.match(week2(validateBlock(skill, ctx)), /"Bike" is station skill work on its own on Fri; .*never a day's only main session/);
  // Titles: "SkiErg" in the title, but the session uses the air bike.
  const t = block();
  t.weeks[1].sessions[2].title = 'SkiErg Repeats';
  assert.match(week2(validateBlock(t, ctx)), /the title names SkiErg, but no exercise in the session uses it/);
  t.weeks[1].sessions[2].title = 'Air Bike Repeats';
  assert.doesNotMatch(week2(validateBlock(t, ctx)), /the title names/);
});

Deno.test('home beginner, no running, no ergs/bike: the weekly shape', () => {
  assert.equal(homeOffFeet({ running: { mode: 'none', own_runs: [] }, off_feet_includes: [] }, 'beginner'), true);
  assert.equal(homeOffFeet({ running: { mode: 'none', own_runs: [] }, off_feet_includes: ['bike'] }, 'beginner'), false);
  assert.equal(homeOffFeet({ running: { mode: 'none', own_runs: [] }, off_feet_includes: null }, 'beginner'), false);
  // Outline: the key session plus the strength sessions (not a session on every training day).
  assert.equal(coreSessionsForStrength('none', 3, 2, true, true), 3);
  assert.equal(coreSessionsForStrength('none', 3, 2, true, false), 5);
  // Outline: exactly key + strength each week, and never the frequency lever.
  const o = outline();
  for (const w of o.weeks) Object.assign(w, { strength_sessions: w.week >= 3 ? 1 : 2, core_sessions: w.week >= 3 ? 2 : 3 });
  const homeOutline = { totalWeeks: 4, daysAvailable: 3, running: 'none' as const, strengthPref: 2, raceDay: 'Sat', beginner: true, homeOffFeet: true };
  assert.deepEqual(validateOutline(o, homeOutline), []);
  o.weeks[1] = { ...o.weeks[1], core_sessions: 4, lever: 'frequency', optional_sessions: 2 };
  const errs = validateOutline(o, homeOutline).join(' ');
  assert.match(errs, /Week 2: core_sessions must be 3 \(the key session \+ 2 strength\)/);
  assert.match(errs, /Week 2: progress by intensity or volume; never the frequency lever/);

  const home: BlockContext = { ...ctx, homeOffFeet: true, beginner: true };
  const week2 = (e: string[]) => e.filter((x) => x.startsWith('Week 2')).join(' | ');
  // A strength key session isn't this athlete's key session.
  const sk = block();
  sk.weeks[1].sessions[0].key_session = true;
  sk.weeks[1].sessions[1].key_session = false;
  assert.match(week2(validateBlock(sk, { ...home, keySessionDay: 'Mon' })), /the key session is bodyweight intervals or an AMRAP\/EMOM at RPE 8\+/);
  // One strength session straight after the key session.
  assert.match(week2(validateBlock(block(), home)), /one strength session goes straight after the key session \("Compromised \+ Tabata", Wed\)/);
  const after = block();
  after.weeks[1].sessions[0].day = 'Wed';
  after.weeks[1].sessions[0].order_in_day = 2;
  assert.doesNotMatch(week2(validateBlock(after, home)), /straight after the key session/);
  // Other days: rest, or an easy brisk walk and mobility — Friday's hard bike session isn't.
  assert.match(week2(validateBlock(after, home)), /"Bike" on Fri: other days are rest, or an easy brisk walk \(RPE 5–6\) and mobility/);
  const walk = structuredClone(after);
  walk.weeks[1].sessions[2] = { ...walk.weeks[1].sessions[2], title: 'Brisk walk', session_type: 'easy_steady', alternatives: [],
    parts: [{ format: 'Aerobic', template_id: null, run_type: null, minutes: 30, items: [item('WALK', '30 min brisk walk @ RPE 5-6 Easy')] }] };
  assert.doesNotMatch(week2(validateBlock(walk, home)), /"Brisk walk" on Fri: other days are rest|steady aerobic parts/);
  // Station skill: a short add-on on a strength day only.
  const station = structuredClone(after);
  station.weeks[1].sessions[0].parts.push({ format: 'Station', template_id: null, run_type: null, minutes: 15, items: [item('WB', '3 × 10 wall balls')] });
  assert.match(week2(validateBlock(station, home)), /station skill is a short add-on \(10 min or less\); this part is 15 min/);
});

Deno.test('repeats follow repeat_preference; race simulations spaced; no long-run efforts for beginners; event priority', () => {
  const same = (w: BlockWeek, n: number): BlockWeek => ({ ...structuredClone(w), week: n, progression: { lever: 'volume', change: 'c' } });
  const b = block();
  b.weeks[1] = same(b.weeks[0], 2); // week 2 = week 1 unchanged
  const errs = (pref: 'same_two_weeks' | 'alternate' | 'always_new') => validateBlock(b, { ...ctx, repeatPreference: pref }).filter((e) => e.startsWith('Week 2')).join(' | ');
  assert.match(errs('always_new'), /repeats a session from the week before unchanged/);
  assert.doesNotMatch(errs('same_two_weeks'), /repeats|same for two weeks/);
  assert.match(errs('alternate'), /repeats last week's session; the athlete alternates/);
  b.weeks[2] = same(b.weeks[0], 3); // three weeks the same
  assert.match(validateBlock(b, { ...ctx, repeatPreference: 'same_two_weeks' }).join(' '), /Week 3: .* has been the same for two weeks; progress it now/);

  // Race simulations follow race_sims. The key session (Wed) becomes a 20-min simulation part + Tabata.
  const sim = block();
  const raceSim = { format: 'RaceSim' as const, template_id: null, run_type: null, minutes: 20, items: [item('WB', '20 wall balls')] };
  sim.weeks[0].sessions[1].parts[0] = structuredClone(raceSim);
  sim.weeks[1].sessions[1].parts[0] = structuredClone(raceSim);
  // plan_for_me: spacing is only a warning (no failure); any phase.
  const warnings: string[] = [];
  const planned = validateBlock(sim, { ...ctx, raceSims: { choice: 'plan_for_me' }, warnings }).join(' ');
  assert.doesNotMatch(planned, /race simulation|specific phase/);
  assert.match(warnings.join(' '), /Week 2: full race simulations are best at most every 3–4 weeks; the last was week 1/);
  // none: no simulations.
  assert.match(validateBlock(sim, { ...ctx, raceSims: { choice: 'none' } }).join(' '), /Week 1: .* the athlete chose no simulations/);
  // my_plan weekly: every week has one (weeks 3 and 4 don't).
  const mine = validateBlock(sim, { ...ctx, raceSims: { choice: 'my_plan', type: 'full', frequency: 'weekly' } }).join(' ');
  assert.match(mine, /Week 3: the athlete does a race simulation every week \(their plan\)/);
  assert.doesNotMatch(mine, /Week 2: the athlete does a race simulation every week/);
  // Always: the day after a full simulation is easy, and none in race week.
  const after = structuredClone(sim);
  after.weeks[1].sessions[2].day = 'Thu'; // Friday's hard bike moves to the day after Wednesday's simulation
  assert.match(validateBlock(after, { ...ctx, trainingDays: ['Mon', 'Wed', 'Thu', 'Sat'], raceSims: { choice: 'plan_for_me' }, warnings: [] }).join(' '),
    /Week 2: "Bike" on Thu is the day after a full race simulation; make it an easy or recovery day/);
  assert.match(validateBlock(sim, { ...ctx, finalWeek: 2 }).join(' '), /Week 2: no full race simulation in race week/);

  // Beginners: no efforts in the long run.
  const lr = block();
  lr.weeks[1].sessions[3].parts = [{ format: 'Run', template_id: null, run_type: 'long', minutes: 40, items: [item('RUN', '40 min @ RPE 5-6 Easy with 4 × 2 min at RPE 8')] }];
  assert.match(validateBlock(lr, { ...ctx, running: 'programmed', beginnerRunner: true }).join(' '), /no efforts in a beginner's long run/);

  // Event priority: A / B / C, with older answers mapped (race it → B, run it as training → C).
  const ev = (e: Record<string, unknown>) => parseInputs({ ...baseInputs, other_events: [{ name: 'X', type: 'hyathlon', date: '2026-11-14', ...e }] }).other_events![0].event_priority;
  assert.deepEqual([ev({ event_priority: 'A' }), ev({ mode: 'race' }), ev({ mode: 'training' })], ['A', 'B', 'C']);
  assert.throws(() => ev({ event_priority: 'D' }), /priority \(A, B or C\)/);
  // race_sims: missing → plan_for_me; my_plan keeps type and frequency.
  assert.deepEqual(parseInputs(baseInputs).race_sims, { choice: 'plan_for_me' });
  assert.deepEqual(parseInputs({ ...baseInputs, race_sims: { choice: 'my_plan', type: 'half', frequency: 'every_2nd_week', preferred_day: 'Sat' } }).race_sims,
    { choice: 'my_plan', type: 'half', frequency: 'every_2nd_week', other: null, preferred_day: 'Sat' });
  assert.throws(() => parseInputs({ ...baseInputs, race_sims: { choice: 'sometimes' } }), /Race simulations: plan_for_me/);
});

Deno.test('deload trimming: shortens database-timed parts, never strength or the key session', () => {
  const b = block();
  const previous = b.weeks[1]; // 3 core sessions, 135 min
  const deload = structuredClone(b.weeks[2]);
  deload.week = 4; deload.progression.lever = 'deload';
  const trimCtx = { ...ctx, settings: { ...ctx.settings, deloadMin: 0.8, deloadMax: 0.9 } };
  const note = trimDeload(deload, previous, trimCtx);
  assert.match(note ?? '', /from 100% to 89%/);
  assert.deepEqual(deload.sessions[2].parts.map((p) => p.minutes), [5, 10]); // Friday HIIT and Aerobic
  assert.deepEqual(deload.sessions[0].parts.map((p) => p.minutes), [30]); // strength untouched
  assert.deepEqual(deload.sessions[1].parts.map((p) => p.minutes), [20, 10]); // key session untouched
  // Already in range: nothing to do.
  const inRange = structuredClone(b.weeks[3]);
  assert.equal(trimDeload(inRange, b.weeks[2], ctx), null);
});

Deno.test('session fields: progression change and cross-training alternatives', () => {
  assert.match(errorsFor((b) => { b.weeks[1].sessions[0].progression.change = ' '; }), /progression\.change/);
  // One erg only: nothing to switch to, so no alternatives needed.
  const noAlts = block();
  noAlts.weeks[1].sessions[2].alternatives = [];
  assert.doesNotMatch(validateBlock(noAlts, ctx).join(' '), /alternatives/);
  // A second erg: the erg session must list it.
  const twoErgs = { ...candidates, exercises: new Map([...candidates.exercises, ['ROW', ex('ROW', { movement_pattern: 'Erg', equipment_options: [['Rower']] })]]) };
  assert.match(validateBlock(noAlts, { ...ctx, candidates: twoErgs }).join(' '), /list alternatives/);
  assert.doesNotMatch(errorsFor((b) => { b.weeks[1].sessions[0].alternatives = []; }), /alternatives/);
});

Deno.test('normalizeBlock fills fields Claude left out', () => {
  const raw = { summary: 's', weeks: [{ week: 1, focus: 'f', progression: { lever: 'start', change: 'c' }, sessions: [
    { day: 'Mon', title: 't', key_session: true, pillar: 'Durability', optional: false, parts: [{ format: 'AMRAP', minutes: 10, items: [{ exercise_id: 'SQ', dose: '10 reps' }] }] },
  ] }] } as unknown as Block;
  const n = normalizeBlock(raw);
  const it = n.weeks[0].sessions[0].parts[0].items[0];
  assert.deepEqual([n.weeks[0].sessions[0].alternatives, n.weeks[0].sessions[0].note], [[], null]);
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

Deno.test('parseInputs: two a day and strength placement (onboarding 10b, 10c)', () => {
  const d = parseInputs(baseInputs);
  assert.deepEqual([d.can_double, d.strength_placement], ['no', 'with_hard_sessions']);
  const set = parseInputs({ ...baseInputs, can_double: 'sometimes', strength_placement: 'own_days' });
  assert.deepEqual([set.can_double, set.strength_placement], ['sometimes', 'own_days']);
  assert.throws(() => parseInputs({ ...baseInputs, can_double: 'maybe' }), /twice in a day/);
  assert.throws(() => parseInputs({ ...baseInputs, strength_placement: 'mornings' }), /with_hard_sessions or own_days/);
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

const app = (previewsLeft: number, confirmationsLeft: number, credits: number, modificationsLeft = 2, modificationCredits = 0): AppAllowance => ({
  kind: 'app', previews: { used: 4 - previewsLeft, limit: 4, left: previewsLeft },
  confirmations: { used: 2 - confirmationsLeft, limit: 2, left: confirmationsLeft }, credits,
  modifications: { used: 2 - modificationsLeft, limit: 2, left: modificationsLeft }, modificationCredits,
  resetsOn: '2026-10-01', timezone: 'Australia/Sydney',
});

Deno.test('plan changes (modification credits): monthly, then purchased; members and coaches unlimited', () => {
  assert.equal(assertCanModify(app(4, 2, 0, 1, 0)), 'monthly');
  assert.equal(assertCanModify(app(4, 2, 0, 0, 3)), 'credit');
  assert.throws(() => assertCanModify(app(4, 2, 0, 0, 0)), (e: HttpError) => e.code === 'monthly_modifications_used' && /Get 4 more for \$10/.test(e.message));
  assert.equal(assertCanModify({ kind: 'member' }), null);
  assert.equal(assertCanModify({ kind: 'coach', builds: { used: 0, limit: 100, left: 100 }, resetsAt: null }), null);
});

Deno.test('onboarding answers → generator inputs and library terms', () => {
  // Training days spread out; the key day is the preferred one if it's a training day.
  assert.deepEqual(suggestTrainingDays(3, []), ['Mon', 'Wed', 'Fri']);
  assert.deepEqual(suggestTrainingDays(3, ['Mon', 'Wed']), ['Tue', 'Thu', 'Sat']);
  assert.deepEqual(suggestTrainingDays(7, ['Sun']), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.equal(suggestKeyDay(['Mon', 'Wed', 'Fri'], 'Fri'), 'Fri');
  assert.equal(suggestKeyDay(['Mon', 'Wed', 'Fri'], 'Tue'), 'Wed');
  const answers = {
    event_goal: { kind: 'hyathlon', division: 'pro', name: 'Sydney', date: '2027-01-23' },
    running_choice: 'program', days_available: 4, days_unavailable: ['Sun'], session_min: '45_60', preferred_key_day: 'Tue',
    training_age: '3_plus_years', training_locations: ['Gym', 'Outdoors'], strength_equipment: ['Barbell and plates', 'Sled'],
    off_feet_equipment: ['Rowing erg', 'Elliptical'], cross_training_preferences: ['Elliptical', 'Rowing erg'], longest_run_min: 60,
    other_events: [{ name: '10k', type: '10k_or_shorter', date: '2026-11-14', event_priority: 'C' }], race_sims: { choice: 'plan_for_me' },
    strength_choice: 'program', strength_sessions_pref: 3,
  };
  const inputs = parseInputs(programInputsFromAnswers(answers));
  assert.equal(inputs.race_option_id, 'hyathlon-pro');
  assert.equal(inputs.goal, 'Hyathlon race – Pro (Sydney) on 2027-01-23');
  assert.equal(inputs.minutes_per_session, 50);
  assert.equal(inputs.training_days.length, 4);
  assert.equal(inputs.running.mode, 'programmed');
  assert.deepEqual(inputs.cross_training_preferences, ['Cross-trainer', 'Rower']);
  assert.equal(inputs.strength_sessions_pref, 3);
  assert.deepEqual(athleteFieldsFromAnswers(answers), {
    level: 'advanced', equipment: ['Barbell', 'Plate', 'Sled', 'Rower', 'Cross-trainer'], training_locations: ['Gym', 'Outdoor'],
  });
  // Missing answers, coming-soon goals and health answers.
  assert.throws(() => programInputsFromAnswers({}), (e: HttpError) => e.code === 'onboarding_incomplete');
  assert.throws(() => programInputsFromAnswers({ ...answers, event_goal: { kind: 'running', distance: '10k', date: '2027-01-23' } }), (e: HttpError) => e.code === 'coming_soon');
  assert.throws(() => checkAnswers({ injury_history: [] }), /consent step/);
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
