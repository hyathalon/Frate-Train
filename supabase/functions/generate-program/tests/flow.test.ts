// End-to-end flow against a real project with a FAKE Claude (no Anthropic
// spend): preview, repair turn, background block 1, activation and archiving,
// purchased credits, claiming a stuck block, failures, and the spend alert.
// Creates throwaway accounts and deletes them.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… deno test --allow-net --allow-env tests/flow.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow, Caller } from '../lib/auth.ts';
import { loadCandidates, slotMatches } from '../lib/candidates.ts';
import type { CallClaude, ClaudeCallInput, ClaudeCallResult } from '../lib/claude.ts';
import { createClient } from '../lib/deps.ts';
import { confirm, type Deps, preview } from '../lib/program.ts';
import type { Block, Outline } from '../lib/schemas.ts';
import { localDate } from '../lib/time.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SECRET_KEY')!, { auth: { persistSession: false } });
const RUN = Date.now();
const inputs = { race_date: '2027-01-23', days_available: 4, weekly_hours: 6, goal: 'Finish Hyrox Open', strengths: ['Running'], weaknesses: ['Wall balls'] };

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
  return { admin, callClaude, now: () => new Date(), runInBackground: (w) => background.push(w), blockEffort: 'medium' };
}

function outline(totalWeeks: number): Outline {
  return {
    summary: 'Test season',
    phases: [
      { name: 'Build', kind: 'build', start_week: 1, end_week: totalWeeks - 1, purpose: 'p' },
      { name: 'Taper', kind: 'taper', start_week: totalWeeks, end_week: totalWeeks, purpose: 'p' },
    ],
    weeks: Array.from({ length: totalWeeks }, (_, i) => ({
      week: i + 1, phase: i + 1 === totalWeeks ? 'taper' : 'build', focus: 'f', load: 'Moderate', deload: false,
      core_sessions: 2, optional_sessions: 1, key_sessions: ['k'], pillars: ['Aerobic Engine'],
    })),
  } as Outline;
}

/** A valid block 1 built from the athlete's real candidate lists. */
async function validBlock(athlete: AthleteRow): Promise<Block> {
  const c = await loadCandidates(admin, athlete, { includeRaceSessions: false });
  const run = [...c.exercises.values()].find((e) => e.movement_pattern === 'Running')!;
  const template = [...c.templates.values()].find((t) => t.method === 'Strength' && t.duration_min <= 45)!;
  const items = template.slots.map((slot) => {
    const e = [...c.exercises.values()].find((x) => slotMatches(slot, x))!;
    return { exercise_id: e.id, race_session_id: null, dose: '3 x 10', notes: null };
  });
  const week = (n: number) => ({
    week: n, focus: 'f', sessions: [
      { day: 'Mon', title: 'Easy run', method: 'Run', template_id: null, duration_min: 40, pillar: 'Aerobic Engine', optional: false, slot: null,
        items: [{ exercise_id: run.id, race_session_id: null, dose: '40 min easy', notes: null }] },
      { day: 'Wed', title: 'Strength', method: 'Strength', template_id: template.id, duration_min: template.duration_min, pillar: 'Durability', optional: false, slot: null, items },
      { day: 'Sat', title: 'Extra run', method: 'Run', template_id: null, duration_min: 30, pillar: 'Aerobic Engine', optional: true, slot: 'extra-run',
        items: [{ exercise_id: run.id, race_session_id: null, dose: '30 min easy', notes: null }] },
    ],
  });
  return { summary: 'Weeks 1-4', weeks: [1, 2, 3, 4].map(week) } as Block;
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
        assert.ok(strength.timing && 'exercise_count' in strength.timing, 'template sessions get plan_session timing');
        const { data: p } = await admin.from('training_programs').select('status, confirmed_at').eq('id', programId).single();
        assert.equal(p!.status, 'active');
        const last = (await events(a.athlete.id)).at(-1)!;
        assert.deepEqual([last.counts_as, last.paid_with], ['confirmation', 'monthly']);
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
        bad.weeks[0].sessions[0].items[0].exercise_id = 'EX9999';
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
      await admin.from('generation_events').delete().in('athlete_id', created.athletes);
      await admin.from('athlete_credit_ledger').delete().in('athlete_id', created.athletes);
      await admin.from('training_programs').delete().in('athlete_id', created.athletes);
      await admin.from('athletes').delete().in('id', created.athletes);
      for (const id of created.users) await admin.auth.admin.deleteUser(id);
    }
  },
});
