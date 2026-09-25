// Integration tests against a real project with NO Anthropic key: every check
// before Claude runs for real, and a request that passes them all stops with
// 503 generation_unavailable. Creates throwaway accounts and deletes them.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… SUPABASE_PUBLISHABLE_KEY=… FUNCTION_URL=http://localhost:8000 \
//     deno test --allow-net --allow-env tests/integration.test.ts
import assert from 'node:assert/strict';
import type { AthleteRow } from '../lib/auth.ts';
import { ALLOWED_RISK, formatExercises, formatRaceSessions, formatTemplates, loadCandidates } from '../lib/candidates.ts';
import { createClient } from '../lib/deps.ts';
import { systemPrompt } from '../lib/prompts.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SECRET_KEY')!, { auth: { persistSession: false } });
const PUBLISHABLE = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const FUNCTION_URL = Deno.env.get('FUNCTION_URL')!;
const RUN = Date.now();

async function call(body: unknown, token?: string) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const created: { users: string[]; athletes: string[] } = { users: [], athletes: [] };

async function makeUser(label: string, athlete?: Partial<AthleteRow>) {
  const email = `claude-int-${label}-${RUN}@example.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  let athleteRow: AthleteRow | null = null;
  if (athlete) {
    const { data: row, error: e2 } = await admin.from('athletes')
      .insert({ user_id: data.user.id, name: `Int ${label}`, ...athlete }).select('*').single();
    if (e2) throw e2;
    created.athletes.push(row.id);
    athleteRow = row as AthleteRow;
  }
  const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
  const { data: session, error: e3 } = await client.auth.signInWithPassword({ email, password });
  if (e3) throw e3;
  return { userId: data.user.id, token: session.session!.access_token, athlete: athleteRow };
}

async function cleanup() {
  if (created.athletes.length) {
    await admin.from('generation_events').delete().in('athlete_id', created.athletes);
    await admin.from('athlete_credit_ledger').delete().in('athlete_id', created.athletes);
    await admin.from('training_programs').delete().in('athlete_id', created.athletes);
    await admin.from('athletes').delete().in('id', created.athletes);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
}

const inputs = { race_date: '2027-01-23', days_available: 4, weekly_hours: 6, goal: 'Finish Hyrox Open under 90 minutes', strengths: ['Running'], weaknesses: ['Wall balls'] };

Deno.test({
  name: 'generate-program without an Anthropic key: auth, roles, inputs and limits',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    try {
      const { data: coachRow } = await admin.from('coaches').select('user_id').limit(1).single();
      const app = await makeUser('app', { tier: 'app', level: 'intermediate', equipment: ['Dumbbell', 'Kettlebell', 'Rower'], training_locations: ['Home', 'Outdoor'] });
      const member = await makeUser('member', { tier: 'member', level: 'beginner', coach_user_id: coachRow!.user_id });
      const other = await makeUser('other', { tier: 'app', level: 'advanced' });
      const nobody = await makeUser('nosetup');

      await t.step('no token → 401 not_signed_in', async () => {
        const r = await call({ action: 'builds_status' });
        assert.equal(r.status, 401);
        assert.equal(r.body.code, 'not_signed_in');
      });
      await t.step('publishable key as bearer → 401', async () => {
        assert.equal((await call({ action: 'builds_status' }, PUBLISHABLE)).status, 401);
      });
      await t.step('garbage token → 401', async () => {
        assert.equal((await call({ action: 'builds_status' }, 'not-a-token')).status, 401);
      });
      await t.step('signed in but not a coach or athlete → 403 not_allowed', async () => {
        const r = await call({ action: 'builds_status' }, nobody.token);
        assert.equal(r.status, 403);
        assert.equal(r.body.code, 'not_allowed');
      });
      await t.step('unknown action → 400', async () => {
        assert.equal((await call({ action: 'nope' }, app.token)).body.code, 'unknown_action');
      });
      await t.step('app athlete builds_status: 4 previews and 2 confirmations this month', async () => {
        const r = await call({ action: 'builds_status' }, app.token);
        assert.equal(r.status, 200);
        assert.equal(r.body.allowance.kind, 'app');
        assert.deepEqual(r.body.allowance.previews, { used: 0, limit: 4, left: 4 });
        assert.deepEqual(r.body.allowance.confirmations, { used: 0, limit: 2, left: 2 });
        assert.match(r.body.allowance.resetsOn, /^\d{4}-\d{2}-01$/);
      });
      await t.step('member builds_status → member (no allowance)', async () => {
        assert.equal((await call({ action: 'builds_status' }, member.token)).body.allowance.kind, 'member');
      });
      await t.step('member preview → 403 coach_builds_member_programs', async () => {
        const r = await call({ action: 'preview', inputs }, member.token);
        assert.equal(r.status, 403);
        assert.equal(r.body.code, 'coach_builds_member_programs');
      });
      await t.step('athlete previewing for someone else → 403 not_your_athlete', async () => {
        const r = await call({ action: 'preview', athlete_id: other.athlete!.id, inputs }, app.token);
        assert.equal(r.body.code, 'not_your_athlete');
      });
      await t.step('bad inputs → 400 with a readable message', async () => {
        const r = await call({ action: 'preview', inputs: { ...inputs, days_available: 9 } }, app.token);
        assert.equal(r.status, 400);
        assert.match(r.body.error, /days a week/);
      });
      await t.step('race under 4 weeks away → 400 race_too_soon', async () => {
        const soon = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
        const r = await call({ action: 'preview', inputs: { ...inputs, race_date: soon } }, app.token);
        assert.equal(r.body.code, 'race_too_soon');
      });
      await t.step('valid preview passes every check → 503 generation_unavailable, nothing counted', async () => {
        const r = await call({ action: 'preview', inputs }, app.token);
        assert.equal(r.status, 503);
        assert.equal(r.body.code, 'generation_unavailable');
        const { count } = await admin.from('training_programs').select('*', { count: 'exact', head: true }).eq('athlete_id', app.athlete!.id);
        assert.equal(count, 0);
      });

      // Use up the app athlete's month with fake successful events.
      const fake = (counts_as: string, extra: Record<string, unknown> = {}) => ({
        user_id: app.userId, athlete_id: app.athlete!.id, call_type: counts_as === 'preview' ? 'outline_preview' : 'confirmation_block',
        counts_as, paid_with: 'monthly', model: 'test', status: 'ok', ...extra,
      });
      await admin.from('generation_events').insert([fake('preview'), fake('preview'), fake('preview'), fake('preview')]);

      await t.step('5th preview in the month → 429 monthly_previews_used with the reset date', async () => {
        const r = await call({ action: 'preview', inputs }, app.token);
        assert.equal(r.status, 429);
        assert.equal(r.body.code, 'monthly_previews_used');
        assert.equal(r.body.allowance.previews.left, 0);
        assert.ok(r.body.allowance.resetsOn);
      });
      await t.step('failed and uncounted events do not use previews', async () => {
        await admin.from('generation_events').delete().eq('athlete_id', app.athlete!.id);
        await admin.from('generation_events').insert([
          fake('preview', { status: 'failed' }),
          { ...fake('preview'), counts_as: null },
          { ...fake('preview'), user_id: coachRow!.user_id }, // a coach's build for this athlete
        ]);
        const r = await call({ action: 'builds_status' }, app.token);
        assert.equal(r.body.allowance.previews.used, 0);
      });

      // A preview program to confirm (outline filled in directly).
      const { data: program } = await admin.from('training_programs').insert({
        athlete_id: app.athlete!.id, created_by: app.userId, status: 'preview', race_date: '2027-01-23',
        start_date: '2026-10-05', total_weeks: 16, inputs, outline: { weeks: [] },
      }).select('id').single();
      await admin.from('generation_events').insert([fake('confirmation'), fake('confirmation')]);

      await t.step('3rd confirmation with no credits → 429 monthly_confirmations_used', async () => {
        const r = await call({ action: 'confirm', program_id: program!.id }, app.token);
        assert.equal(r.status, 429);
        assert.equal(r.body.code, 'monthly_confirmations_used');
      });
      await t.step('with a purchased credit, the confirmation passes every check → 503', async () => {
        await admin.from('athlete_credit_ledger').insert({ athlete_id: app.athlete!.id, kind: 'confirmation', delta: 4, reason: 'grant' });
        const status = await call({ action: 'builds_status' }, app.token);
        assert.equal(status.body.allowance.credits, 4);
        const r = await call({ action: 'confirm', program_id: program!.id }, app.token);
        assert.equal(r.status, 503);
      });
      await t.step("another athlete can't confirm this program → 403", async () => {
        assert.equal((await call({ action: 'confirm', program_id: program!.id }, other.token)).body.code, 'not_your_athlete');
      });
    } finally {
      await cleanup();
      const { count } = await admin.from('athletes').select('*', { count: 'exact', head: true });
      assert.equal(count, 0, 'test athletes left behind');
    }
  },
});

Deno.test({
  name: 'candidate lists from the real library respect the rules; prompt sizes',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const profiles: [string, Partial<AthleteRow>][] = [
      ['beginner, home, dumbbells', { level: 'beginner', equipment: ['Dumbbell', 'Band'], training_locations: ['Home', 'Outdoor'] }],
      ['intermediate, gym', { level: 'intermediate', equipment: ['Dumbbell', 'Kettlebell', 'Barbell', 'Plate', 'Rower', 'SkiErg', 'Sled', 'Wall ball', 'Sandbag', 'Box', 'Bench', 'Pull-up bar'], training_locations: ['Gym', 'Outdoor'] }],
      ['advanced, everything', { level: 'advanced', equipment: [], training_locations: [] }],
    ];
    const { data: all } = await admin.from('exercises').select('id, acute_risk, difficulty');
    const risk = new Map(all!.map((e) => [e.id, e]));
    const reference = await admin.from('hyathlon_reference').select('content')
      .or('filename.ilike.%Hyathlon_System_Booklet%,filename.ilike.%Coaching_Handbook%');
    const systemChars = systemPrompt(reference.data!.map((r) => r.content).join('\n\n')).length;
    console.log(`  system prompt (both reference documents): ${systemChars.toLocaleString()} chars`);

    for (const [label, over] of profiles) {
      const athlete = { id: 'x', user_id: null, name: 'x', tier: 'app', timezone: 'Australia/Sydney', coach_user_id: null, athlete_type: 'hyrox', equipment: [], training_locations: [], ...over } as AthleteRow;
      const c = await loadCandidates(admin, athlete, { includeRaceSessions: true });
      for (const id of c.exercises.keys()) {
        assert.ok(ALLOWED_RISK[athlete.level].includes(risk.get(id)!.acute_risk), `${label}: ${id} breaks the risk rule`);
      }
      if (athlete.level === 'beginner') assert.ok([...c.exercises.values()].every((e) => e.difficulty === 'Beginner'));
      const listChars = formatExercises(c).length + formatTemplates(c).length;
      console.log(`  ${label}: ${c.exercises.size} exercises, ${c.templates.size} templates, ${c.raceSessions.size} race sessions; lists ${listChars.toLocaleString()} chars (+${formatRaceSessions(c).length.toLocaleString()} for race sessions)`);
    }
  },
});
