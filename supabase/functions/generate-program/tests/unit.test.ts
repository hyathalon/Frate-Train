// Unit tests (no network): deno test tests/unit.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow } from '../lib/auth.ts';
import { type Candidates, type Exercise, filterExercises, type Template } from '../lib/candidates.ts';
import { HttpError } from '../lib/http.ts';
import { type AppAllowance, assertCanConfirm, assertCanPreview, type CoachAllowance } from '../lib/limits.ts';
import { parseInputs } from '../lib/program.ts';
import type { Block, Outline } from '../lib/schemas.ts';
import { localDate, monthWindow, nextMonday, planWindow, zonedMidnight } from '../lib/time.ts';
import { validateBlock, validateOutline } from '../lib/validate.ts';

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

Deno.test('nextMonday is always the following Monday', () => {
  assert.equal(nextMonday('2026-09-28'), '2026-10-05'); // Monday → next Monday
  assert.equal(nextMonday('2026-09-27'), '2026-09-28'); // Sunday
  assert.equal(nextMonday('2026-10-03'), '2026-10-05'); // Saturday
});

Deno.test('planWindow counts the race week and caps at 16 weeks', () => {
  assert.deepEqual(planWindow('2026-10-05', '2026-11-01', 16), { startDate: '2026-10-05', totalWeeks: 4, daysToRace: 27 });
  assert.equal(planWindow('2026-10-05', '2026-11-28', 16).totalWeeks, 8);
  const long = planWindow('2026-10-05', '2027-03-06', 16); // 22 weeks away
  assert.equal(long.totalWeeks, 16);
  assert.equal(long.startDate, '2026-11-16'); // starts 6 weeks later
});

Deno.test('Sydney midnights across the October daylight-saving change', () => {
  assert.equal(zonedMidnight(2026, 10, 1, 'Australia/Sydney').toISOString(), '2026-09-30T14:00:00.000Z'); // AEST +10
  assert.equal(zonedMidnight(2026, 11, 1, 'Australia/Sydney').toISOString(), '2026-10-31T13:00:00.000Z'); // AEDT +11
  const w = monthWindow(new Date('2026-10-15T00:00:00Z'), 'Australia/Sydney');
  assert.equal(w.start.toISOString(), '2026-09-30T14:00:00.000Z');
  assert.equal(w.resetsOn, '2026-11-01');
});

Deno.test('month and day boundaries follow the athlete timezone', () => {
  const instant = new Date('2026-09-30T15:30:00Z'); // 1 Oct in Sydney, still 30 Sep in Perth
  assert.equal(localDate(instant, 'Australia/Sydney'), '2026-10-01');
  assert.equal(localDate(instant, 'Australia/Perth'), '2026-09-30');
  assert.equal(monthWindow(instant, 'Australia/Perth').resetsOn, '2026-10-01');
  assert.equal(monthWindow(instant, 'Australia/Sydney').resetsOn, '2026-11-01');
});

// ---------------------------------------------------------------------------
// candidates
// ---------------------------------------------------------------------------

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  movement_pattern: 'Squat',
  body_region: 'Lower',
  methods: ['Strength'],
  primary_pillar: 'Durability',
  difficulty: 'Beginner',
  acute_risk: 'Low',
  where_setting: 'Home or gym',
  equipment_options: [['Bodyweight']],
  is_active: true,
  ...over,
});

const athlete = (over: Partial<AthleteRow> = {}): AthleteRow => ({
  id: 'a',
  user_id: 'u',
  name: 'Test',
  tier: 'app',
  level: 'beginner',
  equipment: [],
  training_locations: [],
  timezone: 'Australia/Sydney',
  coach_user_id: null,
  athlete_type: 'hyrox',
  ...over,
});

Deno.test('risk and difficulty rules by level', () => {
  const lib = [
    ex('LOW'),
    ex('MOD', { acute_risk: 'Moderate', difficulty: 'Intermediate' }),
    ex('HIGH', { acute_risk: 'High', difficulty: 'Advanced' }),
    ex('INT_LOW', { difficulty: 'Intermediate' }),
  ];
  const ids = (level: AthleteRow['level']) => filterExercises(lib, athlete({ level })).map((e) => e.id).sort();
  assert.deepEqual(ids('beginner'), ['LOW']);
  assert.deepEqual(ids('intermediate'), ['INT_LOW', 'LOW', 'MOD']);
  assert.deepEqual(ids('advanced'), ['HIGH', 'INT_LOW', 'LOW', 'MOD']);
});

Deno.test('equipment: any one option fully available; bodyweight and running always available', () => {
  const lib = [
    ex('BW'),
    ex('RUN', { equipment_options: [['None (running)']] }),
    ex('DB', { equipment_options: [['Dumbbell']] }),
    ex('KB_OR_DB', { equipment_options: [['Kettlebell'], ['Dumbbell']] }),
    ex('DB_BENCH', { equipment_options: [['Dumbbell', 'Bench']] }),
    ex('INACTIVE', { is_active: false }),
  ];
  const ids = filterExercises(lib, athlete({ equipment: ['Dumbbell'] })).map((e) => e.id).sort();
  assert.deepEqual(ids, ['BW', 'DB', 'KB_OR_DB', 'RUN']);
});

Deno.test('location filter maps where_setting to Home / Gym / Outdoor', () => {
  const lib = [ex('HG', { where_setting: 'Home or gym' }), ex('G', { where_setting: 'Gym' }), ex('O', { where_setting: 'Outdoor or track' })];
  const ids = (locations: string[]) => filterExercises(lib, athlete({ training_locations: locations })).map((e) => e.id).sort();
  assert.deepEqual(ids(['Home']), ['HG']);
  assert.deepEqual(ids(['Gym']), ['G', 'HG']);
  assert.deepEqual(ids(['Outdoor']), ['O']);
  assert.deepEqual(ids([]), ['G', 'HG', 'O']); // not set: no filter
});

// ---------------------------------------------------------------------------
// validators
// ---------------------------------------------------------------------------

function outline(totalWeeks = 4): Outline {
  return {
    summary: 's',
    phases: [
      { name: 'Build', kind: 'build', start_week: 1, end_week: totalWeeks - 1, purpose: 'p' },
      { name: 'Taper', kind: 'taper', start_week: totalWeeks, end_week: totalWeeks, purpose: 'p' },
    ],
    weeks: Array.from({ length: totalWeeks }, (_, i) => ({
      week: i + 1,
      phase: i + 1 === totalWeeks ? 'taper' : 'build',
      focus: 'f',
      load: 'Moderate',
      deload: false,
      core_sessions: 2,
      optional_sessions: 1,
      key_sessions: ['k'],
      pillars: ['Aerobic Engine'],
    })),
  } as Outline;
}

Deno.test('validateOutline accepts a good outline and names each problem', () => {
  assert.deepEqual(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 3 }), []);
  assert.match(validateOutline(outline(3), { totalWeeks: 4, daysAvailable: 3 }).join(' '), /exactly 4 weeks/);
  const noTaper = outline();
  noTaper.weeks[3].phase = 'build';
  assert.match(validateOutline(noTaper, { totalWeeks: 4, daysAvailable: 3 }).join(' '), /taper/);
  const gap = outline();
  gap.phases[1].start_week = 5;
  assert.match(validateOutline(gap, { totalWeeks: 4, daysAvailable: 3 }).join(' '), /without gaps/);
  assert.match(validateOutline(outline(), { totalWeeks: 4, daysAvailable: 1 }).join(' '), /core_sessions must be between 1 and 1/);
});

const template: Template = {
  id: 'STR-LOWER-30',
  name: 'Lower strength',
  method: 'Strength',
  focus: 'Lower',
  level: 'Beginner',
  duration_min: 30,
  structure: '2 supersets',
  slots: [
    { slot_order: 1, label: 'Squat', movement_patterns: ['Squat'], body_region: 'Lower', hint: null },
    { slot_order: 2, label: 'Hinge', movement_patterns: ['Hinge'], body_region: null, hint: null },
  ],
};

const candidates: Candidates = {
  exercises: new Map([
    ['EX_SQ', ex('EX_SQ')],
    ['EX_HI', ex('EX_HI', { movement_pattern: 'Hinge' })],
    ['EX_RUN', ex('EX_RUN', { movement_pattern: 'Running', equipment_options: [['None (running)']] })],
  ]),
  templates: new Map([[template.id, template]]),
  raceSessions: new Map(),
};

function block(): Block {
  const week = (n: number) => ({
    week: n,
    focus: 'f',
    sessions: [
      { day: 'Mon', title: 'Easy run', method: 'Run', template_id: null, duration_min: 40, pillar: 'Aerobic Engine', optional: false, slot: null,
        items: [{ exercise_id: 'EX_RUN', race_session_id: null, dose: '40 min easy', notes: null }] },
      { day: 'Wed', title: 'Strength', method: 'Strength', template_id: 'STR-LOWER-30', duration_min: 30, pillar: 'Durability', optional: false, slot: null,
        items: [{ exercise_id: 'EX_SQ', race_session_id: null, dose: '8 reps', notes: null }, { exercise_id: 'EX_HI', race_session_id: null, dose: '8 reps', notes: null }] },
      { day: 'Sat', title: 'Extra run', method: 'Run', template_id: null, duration_min: 30, pillar: 'Aerobic Engine', optional: true, slot: 'extra-run',
        items: [{ exercise_id: 'EX_RUN', race_session_id: null, dose: '30 min easy', notes: null }] },
    ],
  });
  return { summary: 's', weeks: [1, 2, 3, 4].map(week) } as Block;
}

const blockCtx = { startWeek: 1, endWeek: 4, outlineWeeks: outline().weeks, daysAvailable: 3, weeklyMinutesMax: 90, candidates };

Deno.test('validateBlock accepts a good block', () => {
  assert.deepEqual(validateBlock(block(), blockCtx), []);
});

Deno.test('validateBlock rejects invented exercises, template mismatches and rule breaks', () => {
  const invented = block();
  invented.weeks[0].sessions[0].items[0].exercise_id = 'EX9999';
  assert.match(validateBlock(invented, blockCtx).join(' '), /EX9999 is not in the candidate exercise list/);

  const wrongSlot = block();
  wrongSlot.weeks[0].sessions[1].items.reverse();
  assert.match(validateBlock(wrongSlot, blockCtx).join(' '), /doesn't fit slot "Squat"/);

  const wrongDuration = block();
  wrongDuration.weeks[1].sessions[1].duration_min = 45;
  assert.match(validateBlock(wrongDuration, blockCtx).join(' '), /must match template STR-LOWER-30 \(30 min\)/);

  const noTemplate = block();
  noTemplate.weeks[0].sessions[1].template_id = null;
  assert.match(validateBlock(noTemplate, blockCtx).join(' '), /Strength sessions must use a session template/);

  const noSlot = block();
  noSlot.weeks[2].sessions[2].slot = null;
  assert.match(validateBlock(noSlot, blockCtx).join(' '), /optional sessions need a slot key/);

  const both = block();
  both.weeks[0].sessions[0].items[0].race_session_id = 'RS0001';
  assert.match(validateBlock(both, blockCtx).join(' '), /exactly one of exercise_id or race_session_id/);

  assert.match(validateBlock(block(), { ...blockCtx, weeklyMinutesMax: 60 }).join(' '), /over the athlete's 60 min a week/);
  assert.match(validateBlock(block(), { ...blockCtx, daysAvailable: 1 }).join(' '), /use 2 days but the athlete has 1/);
});

// ---------------------------------------------------------------------------
// inputs and limits
// ---------------------------------------------------------------------------

Deno.test('parseInputs validates and trims', () => {
  const ok = parseInputs({ race_date: '2027-01-20', days_available: 4, weekly_hours: 6, goal: '  Sub 90  ', strengths: ['Running'], race_name: 'Hyrox Sydney' });
  assert.equal(ok.goal, 'Sub 90');
  assert.equal(ok.weaknesses.length, 0);
  const code = (raw: unknown) => {
    try {
      parseInputs(raw);
      return 'ok';
    } catch (e) {
      return (e as HttpError).code;
    }
  };
  assert.equal(code({ race_date: '2027-02-30', days_available: 4, goal: 'x' }), 'invalid_input');
  assert.equal(code({ race_date: '2027-01-20', days_available: 8, goal: 'x' }), 'invalid_input');
  assert.equal(code({ race_date: '2027-01-20', days_available: 4, goal: '' }), 'invalid_input');
  assert.equal(code({ race_date: '2027-01-20', days_available: 4, goal: 'x', weekly_hours: 99 }), 'invalid_input');
});

const app = (previewsLeft: number, confirmationsLeft: number, credits: number): AppAllowance => ({
  kind: 'app',
  previews: { used: 4 - previewsLeft, limit: 4, left: previewsLeft },
  confirmations: { used: 2 - confirmationsLeft, limit: 2, left: confirmationsLeft },
  credits,
  resetsOn: '2026-10-01',
  timezone: 'Australia/Sydney',
});

Deno.test('allowance decisions: monthly first, then purchased credits, then refused', () => {
  assertCanPreview(app(1, 0, 0));
  assert.throws(() => assertCanPreview(app(0, 2, 0)), (e: HttpError) => e.status === 429 && e.code === 'monthly_previews_used');
  assert.equal(assertCanConfirm(app(4, 1, 3)), 'monthly');
  assert.equal(assertCanConfirm(app(4, 0, 3)), 'credit');
  assert.throws(() => assertCanConfirm(app(4, 0, 0)), (e: HttpError) => e.code === 'monthly_confirmations_used');
  const coach = (left: number): CoachAllowance => ({ kind: 'coach', builds: { used: 100 - left, limit: 100, left }, resetsAt: null });
  assert.equal(assertCanConfirm(coach(5)), null);
  assert.throws(() => assertCanPreview(coach(0)), (e: HttpError) => e.code === 'daily_builds_used');
});
