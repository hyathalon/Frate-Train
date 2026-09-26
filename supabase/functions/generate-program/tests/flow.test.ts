// End-to-end flow against a real project with a FAKE Claude (no Anthropic
// spend): preview, repair turn, background block 1, activation and archiving,
// purchased credits, claiming a stuck block, failures, and the spend alert.
// Creates throwaway accounts and deletes them.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… deno test --allow-net --allow-env tests/flow.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow, Caller } from '../lib/auth.ts';
import { loadCandidates, loadRaceOption, partMinutes, slotMatches } from '../lib/candidates.ts';
import type { CallClaude, ClaudeCallInput, ClaudeCallResult } from '../lib/claude.ts';
import { createClient } from '../lib/deps.ts';
import { confirm, type Deps, preview, weeklyCheckin } from '../lib/program.ts';
import type { Block, Outline } from '../lib/schemas.ts';
import { localDate } from '../lib/time.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SECRET_KEY')!, { auth: { persistSession: false } });
const RUN = Date.now();
const inputs = { race_date: '2027-01-23', training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 45, goal: 'Finish Hyrox Open', strengths: ['Running'], weaknesses: ['Wall balls'] };

// --- fake Claude -----------------------------------------------------------

type Answer = { data: unknown; usage?: Partial<ClaudeCallResult<unknown>['usage']> };
function fakeClaude(answers: Answer[]) {
  const calls: ClaudeCallInput[] = [];
  const fn: CallClaude = <T>(input: ClaudeCallInput) => {
    calls.push(structuredClone(input));
    const next = answers.shift();
    if (!next) throw new Error('fake Claude ran out of answers');
    return Promise.resolve({
      data: next.data as T,
      text: JSON.stringify(next.data),
      usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...next.usage },
      stopReason: 'end_turn',
      durationMs: 5,
      error: null,
    } as ClaudeCallResult<T>);
  };
  return { fn, calls };
}

function makeDeps(callClaude: CallClaude, background: Promise<unknown>[]): Deps {
  return { admin, callClaude, now: () => new Date(), runInBackground: (w) => background.push(w) };
}

function outline(totalWeeks: number): Outline {
  const deload = (w: number) => w % 4 === 0 && w < totalWeeks;
  return {
    summary: 'Test season',
    phases: [
      { name: 'Build', kind: 'build', start_week: 1, end_week: totalWeeks - 1, purpose: 'p' },
      { name: 'Taper', kind: 'taper', start_week: totalWeeks, end_week: totalWeeks, purpose: 'p' },
    ],
    weeks: Array.from({ length: totalWeeks }, (_, i) => ({
      week: i + 1, phase: i + 1 === totalWeeks ? 'taper' : 'build', focus: 'f', load: 'Moderate', deload: deload(i + 1),
      lever: i === 0 ? 'start' : deload(i + 1) ? 'deload' : 'volume', core_sessions: deload(i + 1) ? 2 : 3, optional_sessions: 1,
      key_session: 'Circuit + intervals', key_sessions: ['k'], pillars: ['Aerobic Engine'],
    })),
  } as Outline;
}

const item = (id: string, dose: string, over: Record<string, unknown> = {}) => ({
  exercise_id: id, race_session_id: null, dose, cue: null, block: null, foot_contacts: null, run_minutes: null, run_distance_m: null, ...over,
});

/** A valid block 1 (45-min sessions, Mon/Wed/Fri + optional Sat) from the athlete's real candidate lists. */
async function validBlock(athlete: AthleteRow): Promise<Block> {
  const race = (await loadRaceOption(admin, 'hyrox-open'))!;
  const c = await loadCandidates(admin, athlete, race, { includeRaceSessions: false });
  const all = [...c.exercises.values()];
  const erg = all.find((e) => e.movement_pattern === 'Erg')!;
  const run = all.find((e) => e.movement_pattern === 'Running')!;
  const station = all.find((e) => e.id === 'EX0199') ?? all.find((e) => e.movement_pattern === 'Med ball / throw')!;
  const strength = [...c.templates.values()].find((t) => t.method === 'Strength' && partMinutes(t) === 30)!;
  const circuit = [...c.templates.values()].find((t) => t.method === 'Circuit' && partMinutes(t) === 20)!;
  const fill = (t: typeof strength, dose: (i: number) => string) =>
    t.slots.map((slot, i) => item(all.find((x) => slotMatches(slot, x))!.id, dose(i)));
  const week = (n: number, deload = false) => {
    const sessions = [
      { day: 'Mon', title: 'Strength', key_session: false, pillar: 'Durability', optional: false, slot: null,
        parts: [{ format: 'Strength', template_id: strength.id, minutes: 30, items: fill(strength, () => `3 × ${6 + n}, moderate load, RPE 7`) }] },
      { day: 'Wed', title: 'Circuit + intervals', key_session: true, pillar: 'Threshold', optional: false, slot: null,
        parts: [
          { format: 'Circuit', template_id: circuit.id, minutes: 20, items: fill(circuit, () => `RPE ${6 + (n % 3)}, steady`) },
          { format: 'HIIT', template_id: null, minutes: 10, items: [item(erg.id, `hard, RPE 8, week ${n}`)] },
        ] },
      { day: 'Fri', title: 'Steady erg', key_session: false, pillar: 'Aerobic Engine', optional: false, slot: null,
        parts: [{ format: 'Aerobic', template_id: null, minutes: 30, items: [item(erg.id, `steady, RPE 6-7, build ${n}`)] }] },
      { day: 'Sat', title: 'Compromised', key_session: false, pillar: 'Fatigue Management', optional: true, slot: 'compromised',
        parts: [{ format: 'Compromised', template_id: null, minutes: 30, items: [item(run.id, '400 m run, RPE 8', { run_minutes: 6 }), item(station.id, `${10 + n} wall balls`)] }] },
    ];
    if (deload) sessions.splice(0, 1);
    return { week: n, focus: 'f', progression: { lever: n === 1 ? 'start' : deload ? 'deload' : 'volume', change: 'c' }, sessions };
  };
  return { summary: 'Weeks 1-4', weeks: [week(1), week(2), week(3), week(4, true)] } as unknown as Block;
}

// --- accounts ---------------------------------------------------------------

const created: { users: string[]; athletes: string[] } = { users: [], athletes: [] };
async function makeAthlete(label: string): Promise<{ caller: Caller; athlete: AthleteRow }> {
  const { data, error } = await admin.auth.admin.createUser({ email: `claude-flow-${label}-${RUN}@example.com`, password: crypto.randomUUID(), email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const { data: row, error: e2 } = await admin.from('athletes').insert({
    user_id: data.user.id, name: `Flow ${label}`, tier: 'app', level: 'intermediate',
    equipment: ['Dumbbell', 'Kettlebell', 'Barbell', 'Plate', 'Bench', 'Rower'], training_locations: ['Home', 'Gym', 'Outdoor'],
  }).select('*').single();
  if (e2) throw e2;
  created.athletes.push(row.id);
  return { caller: { userId: data.user.id, role: 'athlete', athlete: row as AthleteRow }, athlete: row as AthleteRow };
}

async function events(athleteId: string) {
  const { data } = await admin.from('generation_events').select('*').eq('athlete_id', athleteId).order('id');
  return data!;
}

Deno.test({
  name: 'program flow with a fake Claude',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const today = localDate(new Date(), 'Australia/Sydney');
    const { data: existingSpend } = await admin.from('coach_alerts').select('id').eq('kind', 'spend').eq('alert_date', today);
    assert.equal(existingSpend!.length, 0, 'a real spend alert exists today; not running the spend test');
    try {
      const a = await makeAthlete('a');
      const background: Promise<unknown>[] = [];

      let programId = '';
      await t.step('preview: outline saved, one preview used, cost recorded', async () => {
        const fake = fakeClaude([{ data: outline(16) }]);
        const r = await preview(makeDeps(fake.fn, background), a.caller, { inputs });
        programId = r.program.id;
        assert.equal(r.program.total_weeks, 16);
        assert.equal(fake.calls[0].model.model, 'claude-haiku-4-5');
        assert.equal(r.allowance.kind === 'app' && r.allowance.previews.left, 3);
        const { data: p } = await admin.from('training_programs').select('status, outline_version').eq('id', programId).single();
        assert.deepEqual(p, { status: 'preview', outline_version: 1 });
        const ev = await events(a.athlete.id);
        assert.equal(ev.length, 1);
        assert.equal(ev[0].counts_as, 'preview');
        assert.equal(Number(ev[0].cost_usd), 0.0035); // Haiku: 1000 in × $1 + 500 out × $5 per million
      });

      await t.step('repair: a rule-breaking answer gets one repair turn with the errors', async () => {
        const fake = fakeClaude([{ data: outline(10) }, { data: outline(16) }]);
        await preview(makeDeps(fake.fn, background), a.caller, { inputs });
        assert.equal(fake.calls.length, 2);
        const repairTurn = fake.calls[1].messages;
        assert.equal(repairTurn.length, 3);
        assert.equal(repairTurn[1].role, 'assistant');
        assert.match(String(repairTurn[2].content), /exactly 16 weeks/);
        const ev = (await events(a.athlete.id)).slice(-2);
        assert.deepEqual(ev.map((e) => [e.status, e.is_repair, e.counts_as]), [['failed', false, null], ['ok', true, 'preview']]);
      });

      await t.step('confirm: block 1 generates in the background, program activates, one confirmation used', async () => {
        const fake = fakeClaude([{ data: await validBlock(a.athlete) }]);
        const r = await confirm(makeDeps(fake.fn, background), a.caller, { program_id: programId });
        assert.deepEqual(r, { program_id: programId, block_no: 1, weeks: [1, 4], status: 'generating' });
        await Promise.all(background.splice(0));
        assert.equal(fake.calls[0].model.model, 'claude-sonnet-5');
        assert.equal(fake.calls[0].effort, 'medium');
        const { data: block } = await admin.from('program_blocks').select('status, sessions, started_at').eq('program_id', programId).eq('block_no', 1).single();
        assert.equal(block!.status, 'ready');
        assert.ok(block!.started_at);
        const strength = (block!.sessions as Block).weeks[0].sessions[1];
        assert.ok(strength.parts[0].timing && 'exercise_count' in strength.parts[0].timing, 'parts get plan_format timing');
        assert.deepEqual(strength.frame, { warmup_min: 10, cooldown_min: 5, total_min: 45 });
        const { data: p } = await admin.from('training_programs').select('status, confirmed_at').eq('id', programId).single();
        assert.equal(p!.status, 'active');
        const last = (await events(a.athlete.id)).at(-1)!;
        assert.deepEqual([last.counts_as, last.paid_with], ['confirmation', 'monthly']);
      });

      await t.step('weekly check-in: tired athlete gets a lighter week 1; the original is kept; nothing counted', async () => {
        const before = (await events(a.athlete.id)).length;
        const lighter = (await validBlock(a.athlete)).weeks[0];
        lighter.progression = { lever: 'deload', change: 'lighter week' };
        lighter.sessions.forEach((s) => s.parts.forEach((p) => p.items.forEach((it) => { it.cue = 'keep it easy'; })));
        const fake = fakeClaude([{ data: { summary: 'Lighter week', weeks: [lighter] } }]);
        const r = await weeklyCheckin(makeDeps(fake.fn, background), a.caller, { program_id: programId, week: 1, energy: 'poor', sleep: 'ok' });
        assert.equal(r.status, 'adjusting');
        await Promise.all(background.splice(0));
        assert.match(String(fake.calls[0].messages[0].content), /Rewrite week 1 only, because: low energy/);
        const { data: c } = await admin.from('weekly_checkins').select('status, reasons, previous_week').eq('program_id', programId).eq('week', 1).single();
        assert.equal(c!.status, 'adjusted');
        assert.deepEqual(c!.reasons, ['low energy']);
        assert.ok(c!.previous_week, 'original week kept');
        const { data: block } = await admin.from('program_blocks').select('sessions').eq('program_id', programId).eq('block_no', 1).single();
        assert.equal((block!.sessions as Block).weeks[0].progression.lever, 'deload');
        const ev = (await events(a.athlete.id)).slice(before);
        assert.deepEqual(ev.map((e) => [e.call_type, e.counts_as]), [['week_adjust', null]]);
      });

      await t.step('weekly check-in: once per week, only for the coming week', async () => {
        const deps = makeDeps(fakeClaude([]).fn, background);
        await assert.rejects(weeklyCheckin(deps, a.caller, { program_id: programId, week: 1, energy: 'good', sleep: 'good' }), (e: { code: string }) => e.code === 'already_checked_in');
        await assert.rejects(weeklyCheckin(deps, a.caller, { program_id: programId, week: 3, energy: 'good', sleep: 'good' }), (e: { code: string }) => e.code === 'wrong_week');
      });

      await t.step('confirming again is idempotent and costs nothing', async () => {
        const fake = fakeClaude([]);
        const r = await confirm(makeDeps(fake.fn, background), a.caller, { program_id: programId });
        assert.equal(r.status, 'ready');
        assert.equal(fake.calls.length, 0);
      });

      let secondId = '';
      await t.step('a failed block: marked failed, coach alerted, nothing counted, program stays a preview', async () => {
        const fake = fakeClaude([{ data: outline(16) }]);
        secondId = (await preview(makeDeps(fake.fn, background), a.caller, { inputs })).program.id;
        const bad = await validBlock(a.athlete);
        bad.weeks[0].sessions[0].parts[0].items[0].exercise_id = 'EX9999';
        const failing = fakeClaude([{ data: bad }, { data: bad }]);
        await confirm(makeDeps(failing.fn, background), a.caller, { program_id: secondId });
        await Promise.all(background.splice(0));
        assert.equal(failing.calls.length, 2, 'first try plus one repair');
        const { data: block } = await admin.from('program_blocks').select('status, last_error').eq('program_id', secondId).single();
        assert.equal(block!.status, 'failed');
        assert.match(block!.last_error!, /didn't use a confirmation/);
        const { data: alerts } = await admin.from('coach_alerts').select('kind').eq('program_id', secondId);
        assert.deepEqual(alerts!.map((x) => x.kind), ['generation_failed']);
        const { data: p } = await admin.from('training_programs').select('status').eq('id', secondId).single();
        assert.equal(p!.status, 'preview');
      });

      await t.step('retry after failure succeeds; the older active program is archived', async () => {
        const fake = fakeClaude([{ data: await validBlock(a.athlete) }]);
        await confirm(makeDeps(fake.fn, background), a.caller, { program_id: secondId });
        await Promise.all(background.splice(0));
        const { data: programs } = await admin.from('training_programs').select('id, status').in('id', [programId, secondId]);
        const status = Object.fromEntries(programs!.map((p) => [p.id, p.status]));
        assert.equal(status[secondId], 'active');
        assert.equal(status[programId], 'archived');
      });

      await t.step('monthly confirmations used → a purchased credit is used and recorded', async () => {
        await admin.from('athlete_credit_ledger').insert({ athlete_id: a.athlete.id, kind: 'confirmation', delta: 1, reason: 'grant' });
        const fake = fakeClaude([{ data: outline(16) }, { data: await validBlock(a.athlete) }]);
        const deps = makeDeps(fake.fn, background);
        const third = (await preview(deps, a.caller, { inputs })).program.id;
        await confirm(deps, a.caller, { program_id: third });
        await Promise.all(background.splice(0));
        const last = (await events(a.athlete.id)).at(-1)!;
        assert.deepEqual([last.counts_as, last.paid_with], ['confirmation', 'credit']);
        const { data: ledger } = await admin.from('athlete_credit_ledger').select('delta, reason').eq('athlete_id', a.athlete.id).order('id');
        assert.deepEqual(ledger!.map((l) => [l.delta, l.reason]), [[1, 'grant'], [-1, 'used']]);
      });

      await t.step('a block already generating is not started twice; a stuck one can be retried', async () => {
        const b = await makeAthlete('b');
        const fake = fakeClaude([{ data: outline(16) }]);
        const id = (await preview(makeDeps(fake.fn, background), b.caller, { inputs })).program.id;
        await admin.from('program_blocks').insert({ program_id: id, block_no: 1, start_week: 1, end_week: 4, status: 'generating', started_at: new Date().toISOString() });
        const none = fakeClaude([]);
        assert.equal((await confirm(makeDeps(none.fn, background), b.caller, { program_id: id })).status, 'generating');
        assert.equal(background.length, 0, 'no second generation started');
        await admin.from('program_blocks').update({ started_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq('program_id', id);
        const retry = fakeClaude([{ data: await validBlock(b.athlete) }]);
        await confirm(makeDeps(retry.fn, background), b.caller, { program_id: id });
        await Promise.all(background.splice(0));
        const { data: block } = await admin.from('program_blocks').select('status').eq('program_id', id).single();
        assert.equal(block!.status, 'ready');
      });

      await t.step('weekly check-in: ongoing availability change updates the program; key day must stay a training day', async () => {
        const d = await makeAthlete('d');
        const fake = fakeClaude([{ data: outline(16) }, { data: await validBlock(d.athlete) }]);
        const deps = makeDeps(fake.fn, background);
        const id = (await preview(deps, d.caller, { inputs })).program.id;
        await confirm(deps, d.caller, { program_id: id });
        await Promise.all(background.splice(0));
        await assert.rejects(
          weeklyCheckin(deps, d.caller, { program_id: id, week: 1, energy: 'good', sleep: 'good', availability: { training_days: ['Mon', 'Fri', 'Sat'], applies: 'ongoing' } }),
          (e: { message: string }) => /key session/.test(e.message),
        );
        const adjusted = (await validBlock(d.athlete)).weeks[0];
        // Three days now: Wed, Fri and Sat, all core (Saturday's session is no longer optional).
        adjusted.sessions = adjusted.sessions.filter((s) => s.day !== 'Mon');
        const sat = adjusted.sessions.find((s) => s.day === 'Sat')!;
        sat.optional = false;
        sat.slot = null;
        const deps2 = makeDeps(fakeClaude([{ data: { summary: 's', weeks: [adjusted] } }]).fn, background);
        const r = await weeklyCheckin(deps2, d.caller, {
          program_id: id, week: 1, energy: 'good', sleep: 'good',
          availability: { training_days: ['Wed', 'Fri', 'Sat'], applies: 'ongoing' },
        });
        assert.deepEqual(r.reasons, ['availability changed']);
        await Promise.all(background.splice(0));
        const { data: p } = await admin.from('training_programs').select('inputs').eq('id', id).single();
        assert.deepEqual(p!.inputs.training_days, ['Wed', 'Fri', 'Sat']);
        const { data: c } = await admin.from('weekly_checkins').select('status, last_error').eq('program_id', id).eq('week', 1).single();
        assert.equal(c!.status, 'adjusted', c!.last_error ?? '');
      });

      await t.step('spend alert: raised once when today passes the threshold', async () => {
        const c = await makeAthlete('c');
        // 2 million output tokens on Haiku = $10 of fake spend.
        const fake = fakeClaude([{ data: outline(16), usage: { output_tokens: 2_000_000 } }, { data: outline(16), usage: { output_tokens: 2_000_000 } }]);
        await preview(makeDeps(fake.fn, background), c.caller, { inputs });
        await preview(makeDeps(fake.fn, background), c.caller, { inputs });
        const { data: alerts } = await admin.from('coach_alerts').select('message').eq('kind', 'spend').eq('alert_date', today);
        assert.equal(alerts!.length, 1);
        assert.match(alerts![0].message, /passed \$10\.00/);
      });
    } finally {
      await admin.from('coach_alerts').delete().eq('kind', 'spend').eq('alert_date', today);
      await admin.from('coach_alerts').delete().in('athlete_id', created.athletes);
      await admin.from('weekly_checkins').delete().in('submitted_by', created.users);
      await admin.from('generation_events').delete().in('athlete_id', created.athletes);
      await admin.from('athlete_credit_ledger').delete().in('athlete_id', created.athletes);
      await admin.from('training_programs').delete().in('athlete_id', created.athletes);
      await admin.from('athletes').delete().in('id', created.athletes);
      for (const id of created.users) await admin.auth.admin.deleteUser(id);
    }
  },
});
