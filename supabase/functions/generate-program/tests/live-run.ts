// Live generation test against the DEPLOYED generate-program function: real
// Anthropic spend, capped. Not part of `deno test`; run it only when approved.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… SUPABASE_PUBLISHABLE_KEY=… CAP=2 OUT=/some/dir \
//     deno run --allow-net --allow-env --allow-read --allow-write tests/live-run.ts
//
// Optional: ONLY=<profile key> runs one profile. Creates throwaway accounts
// (claude-live-*@example.com) and deletes them at the end; generation_events are kept.
import { createClient } from '../lib/deps.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const PUBLISHABLE = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const FN = `${URL_}/functions/v1/generate-program`;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SECRET_KEY')!, { auth: { persistSession: false } });
const CAP = Number(Deno.env.get('CAP') ?? '2');
const ONLY = Deno.env.get('ONLY');
const RESERVE = Number(Deno.env.get('RESERVE') ?? '0.6'); // worst case per profile: preview + 4 week calls + repairs
const OUT = (Deno.env.get('OUT') ?? './live-out').replace(/\/?$/, '/');
await Deno.mkdir(OUT, { recursive: true });
const RUN = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const created = { users: [] as string[], athletes: [] as string[] };

async function makeUser(label: string) {
  const email = `claude-live-${label}-${RUN}@example.com`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const client = createClient(URL_, PUBLISHABLE, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { userId: data.user.id, token: s.session!.access_token };
}

async function makeAthlete(userId: string, row: Record<string, unknown>) {
  const { data, error } = await admin.from('athletes').insert({ user_id: userId, ...row }).select('id').single();
  if (error) throw error;
  created.athletes.push(data.id);
  return data.id as string;
}

async function call(body: unknown, token: string) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function spent(): Promise<number> {
  if (!created.athletes.length) return 0;
  const { data } = await admin.from('generation_events').select('cost_usd').in('athlete_id', created.athletes);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}

interface Profile {
  key: string;
  member?: boolean;
  athlete: Record<string, unknown>;
  inputs: Record<string, unknown>;
  taperWeeks?: number[]; // weeks the outline must put in the taper, or the block isn't worth testing
}

const RACE_12 = '2026-12-26'; // a Saturday, 12 weeks after Monday 5 October 2026
const profiles: Profile[] = [
  {
    key: 'beginner-home-none',
    athlete: { tier: 'app', level: 'beginner', equipment: ['Dumbbell', 'Kettlebell', 'Band', 'Skipping rope', 'Wall ball'], training_locations: ['Home'] },
    inputs: { race_date: RACE_12, training_days: ['Mon', 'Wed', 'Sat'], key_session_day: 'Wed', minutes_per_session: 40,
      goal: 'Finish my first Hyathlon race feeling strong', strengths: ['Consistency'], weaknesses: ['Running', 'Upper-body strength'],
      running: { mode: 'none' }, can_double: 'no', strength_placement: 'with_hard_sessions', limiters: ['aerobic_fitness'],
      training_age: 'under_6_months', variety_preference: 'balance', dislikes: 'burpees' },
  },
  {
    key: 'experienced-member-programmed',
    member: true,
    athlete: { tier: 'member', level: 'advanced', equipment: ['Barbell', 'Dumbbell', 'Kettlebell', 'Sled', 'Wall ball', 'SkiErg', 'Rower', 'BikeErg', 'Sandbag', 'Box', 'Pull-up bar', 'Treadmill'], training_locations: ['Gym', 'Outdoor'] },
    inputs: { race_date: RACE_12, training_days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'], key_session_day: 'Tue', minutes_per_session: 60,
      goal: 'Hyathlon race – Pro under 75 minutes', strengths: ['Running', 'Sled push'], weaknesses: ['Wall balls', 'Burpee broad jumps'],
      longest_run_min: 70, cross_training_preferences: ['BikeErg', 'Rower', 'SkiErg'], running: { mode: 'programmed' },
      can_double: 'yes', strength_placement: 'with_hard_sessions', limiters: ['strength_endurance'], training_age: '3_plus_years',
      runs_per_week: 4, recent_result: { event: 'Hyathlon race – Pro', time: '1:19:30', date: '2026-06-14', avg_run_pace: '4:35 /km' },
      preferred_long_run_day: 'Sat', variety_preference: 'variety' },
  },
  {
    key: 'low-availability-own-plan',
    athlete: { tier: 'app', level: 'intermediate', equipment: ['Dumbbell', 'Kettlebell', 'Rower', 'Wall ball', 'Box'], training_locations: ['Home', 'Gym'] },
    inputs: { race_date: RACE_12, training_days: ['Tue', 'Sat'], key_session_day: 'Sat', minutes_per_session: 45,
      goal: 'Finish a Hyathlon race – Doubles with my partner', strengths: ['Running'], weaknesses: ['Stations'],
      longest_run_min: 60, running: { mode: 'own_plan', own_runs: [{ day: 'Thu', intensity: 'hard' }, { day: 'Sun', intensity: 'easy' }] },
      can_double: 'sometimes', strength_placement: 'own_days', strength_sessions_pref: 2, training_age: '1_3_years', runs_per_week: 2 },
  },
  {
    key: 'specific-4wk-programmed',
    athlete: { tier: 'app', level: 'intermediate', equipment: ['Dumbbell', 'Kettlebell', 'Wall ball', 'Rower', 'SkiErg', 'Sled', 'Sandbag'], training_locations: ['Gym', 'Outdoor'] },
    inputs: { race_date: '2026-10-31', training_days: ['Mon', 'Wed', 'Thu', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50,
      goal: 'Hyathlon race – Open, sharpen for race day, with a 2-week taper (weeks 3 and 4)', strengths: ['Rowing'], weaknesses: ['Compromised running'],
      longest_run_min: 50, cross_training_preferences: ['Rower', 'SkiErg'], running: { mode: 'programmed' },
      can_double: 'sometimes', strength_placement: 'with_hard_sessions', limiters: ['running'], training_age: '1_3_years', runs_per_week: 3,
      interval_experience: 'yes' },
    taperWeeks: [3, 4],
  },
];

interface Result { key: string; previewMs?: number; blockMs?: number; status?: string; error?: string; cost?: number; events?: unknown[] }
const results: Result[] = [];

let coach: { userId: string; token: string } | null = null;
async function getCoach() {
  if (coach) return coach;
  coach = await makeUser('coach');
  const { error } = await admin.from('coaches').insert({ user_id: coach.userId, display_name: 'Live test coach' });
  if (error) throw error;
  return coach;
}

async function runProfile(p: Profile): Promise<Result> {
  const r: Result = { key: p.key };
  try {
    const u = await makeUser(p.key);
    const c = p.member ? await getCoach() : null;
    const athleteId = await makeAthlete(u.userId, { name: `Live ${p.key}`, ...(c ? { coach_user_id: c.userId } : {}), ...p.athlete });
    const token = c ? c.token : u.token;
    let t0 = Date.now();
    let pv = await call({ action: 'preview', athlete_id: athleteId, inputs: p.inputs }, token);
    r.previewMs = Date.now() - t0;
    log(p.key, 'preview', pv.status, `${(r.previewMs / 1000).toFixed(0)} s`);
    if (pv.status !== 200) throw new Error(`preview ${pv.status}: ${JSON.stringify(pv.body)}`);
    const taperOk = (body: { program: { outline: { weeks: { week: number; phase: string }[] } } }) =>
      (p.taperWeeks ?? []).every((n) => body.program.outline.weeks.find((w) => w.week === n)?.phase === 'taper');
    if (!taperOk(pv.body)) {
      log(p.key, 'outline has no taper in weeks', p.taperWeeks?.join(', '), '- previewing once more');
      pv = await call({ action: 'preview', athlete_id: athleteId, inputs: p.inputs }, token);
      if (pv.status !== 200) throw new Error(`preview ${pv.status}: ${JSON.stringify(pv.body)}`);
      if (!taperOk(pv.body)) throw new Error(`the outline didn't put weeks ${p.taperWeeks?.join(', ')} in the taper; block not generated`);
    }
    await Deno.writeTextFile(`${OUT}${p.key}.preview.json`, JSON.stringify(pv.body, null, 2));
    const programId = pv.body.program.id;
    t0 = Date.now();
    const cf = await call({ action: 'confirm', program_id: programId }, token);
    if (cf.status !== 202) throw new Error(`confirm ${cf.status}: ${JSON.stringify(cf.body)}`);
    for (;;) {
      await new Promise((res) => setTimeout(res, 10_000));
      const { data } = await admin.from('program_blocks').select('status, sessions').eq('program_id', programId).eq('block_no', 1).single();
      if (data && data.status !== 'generating' && data.status !== 'pending') {
        r.status = data.status;
        r.blockMs = Date.now() - t0;
        await Deno.writeTextFile(`${OUT}${p.key}.block.json`, JSON.stringify(data.sessions, null, 2));
        break;
      }
      if (Date.now() - t0 > 480_000) { r.status = 'timeout'; break; }
    }
    const { data: ev } = await admin.from('generation_events')
      .select('call_type, status, is_repair, counts_as, cost_usd, duration_ms, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, error')
      .eq('athlete_id', athleteId).order('id');
    r.events = ev ?? [];
    r.cost = (ev ?? []).reduce((s, e) => s + Number(e.cost_usd ?? 0), 0);
    log(p.key, r.status, `block ${((r.blockMs ?? 0) / 1000).toFixed(0)} s`, `$${r.cost.toFixed(3)}`);
  } catch (e) {
    r.error = String(e instanceof Error ? e.message : e);
    log(p.key, 'ERROR', r.error.slice(0, 300));
  }
  await Deno.writeTextFile(`${OUT}${p.key}.result.json`, JSON.stringify(r, null, 2));
  return r;
}

async function cleanup() {
  if (created.athletes.length) {
    await admin.from('athlete_credit_ledger').delete().in('athlete_id', created.athletes);
    await admin.from('training_programs').delete().in('athlete_id', created.athletes);
    await admin.from('athletes').delete().in('id', created.athletes);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  log('cleaned up', created.athletes.length, 'athletes,', created.users.length, 'users (generation_events kept)');
}

// Hard stop: the cap is otherwise only checked before a profile starts, and a
// running block keeps repairing on the server. When spend reaches the cap, turn
// on app_settings.generation_paused (checked before every Claude call).
async function setPaused(value: 0 | 1) {
  const { error } = await admin.from('app_settings').update({ value }).eq('key', 'generation_paused');
  if (error) throw error;
}
let watching = true;
let paused = false;
const watcher = (async () => {
  while (watching) {
    if (!paused && (await spent()) >= CAP) {
      await setPaused(1);
      paused = true;
      log('CAP REACHED: generation paused');
    }
    await new Promise((res) => setTimeout(res, 3_000));
  }
})();

try {
  // Profiles run in parallel, each started only while the cap covers a worst case for everything in flight.
  const running: Promise<void>[] = [];
  let inFlight = 0;
  for (const p of profiles.filter((x) => !ONLY || ONLY.split(',').includes(x.key))) {
    while (inFlight > 0 && (await spent()) + (inFlight + 1) * RESERVE > CAP) await new Promise((res) => setTimeout(res, 15_000));
    if ((await spent()) + (inFlight + 1) * RESERVE > CAP) {
      log('cap: skipping', p.key);
      results.push({ key: p.key, error: 'skipped: cap' });
      continue;
    }
    inFlight++;
    log('start', p.key);
    running.push(runProfile(p).then((r) => { results.push(r); inFlight--; }));
    await new Promise((res) => setTimeout(res, 2_000));
  }
  await Promise.all(running);
  log('TOTAL spent', `$${(await spent()).toFixed(3)}`);
} finally {
  watching = false;
  await watcher;
  await setPaused(0);
  const { data } = await admin.from('app_settings').select('value').eq('key', 'generation_paused').single();
  log('generation_paused is', data?.value);
  await Deno.writeTextFile(`${OUT}summary.json`, JSON.stringify(results, null, 2));
  await cleanup();
}
