// Reliability run: generate block 1 for many hard profiles against the DEPLOYED
// function and measure validator failures, repair rounds, blocks still failing
// after repairs, and cost per block. Real Anthropic spend, hard-stopped at CAP.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… SUPABASE_PUBLISHABLE_KEY=… CAP=10 OUT=/dir \
//     deno run --allow-net --allow-env --allow-read --allow-write tests/reliability-run.ts
import { createClient } from '../lib/deps.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const PUBLISHABLE = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const FN = `${URL_}/functions/v1/generate-program`;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SECRET_KEY')!, { auth: { persistSession: false } });
const CAP = Number(Deno.env.get('CAP') ?? '10');
const CALL_MARGIN = 0.15;
const RESERVE = 0.7;
const CONCURRENCY = Number(Deno.env.get('CONCURRENCY') ?? '5');
const OUT = (Deno.env.get('OUT') ?? './reliability-out').replace(/\/?$/, '/');
await Deno.mkdir(OUT, { recursive: true });
const RUN = Date.now();
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const created = { users: [] as string[], athletes: [] as string[] };

// Program start Mon 5 Oct 2026. Race dates are Saturdays.
const R16 = '2027-01-23', R12 = '2026-12-26', R8 = '2026-11-28', R6 = '2026-11-14', R4 = '2026-10-31';
const GYM = ['Barbell', 'Plate', 'Dumbbell', 'Kettlebell', 'Kettlebell or dumbbell', 'Bench', 'Box', 'Sled', 'Sandbag', 'Wall ball', 'Pull-up bar', 'Rower', 'SkiErg', 'BikeErg', 'Treadmill', 'Med ball'];
const HOME = ['Dumbbell', 'Kettlebell', 'Kettlebell or dumbbell', 'Band', 'Wall ball'];

interface Profile { key: string; member?: boolean; athlete: Record<string, unknown>; inputs: Record<string, unknown>; checkin?: Record<string, unknown> }
const base = (o: Record<string, unknown>) => ({ goal: 'Hyathlon race', strengths: [], weaknesses: [], ...o });
const P: Profile[] = [
  { key: '01-two-A-races-8wk-apart', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R16, training_days: ['Mon', 'Tue', 'Thu', 'Sat'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes',
      other_events: [{ name: 'Hyathlon Melbourne', type: 'hyathlon', date: R8, event_priority: 'A' }] }) },
  { key: '02-A-with-B-and-C-near', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sun'], key_session_day: 'Wed', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 70, interval_experience: 'yes',
      other_events: [{ name: 'Half', type: 'half_marathon', date: '2026-12-05', event_priority: 'B' }, { name: 'Parkrun', type: '10k_or_shorter', date: '2026-12-19', event_priority: 'C' }] }) },
  { key: '03-weekly-sims-into-taper', athlete: { tier: 'app', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R4, training_days: ['Mon', 'Tue', 'Thu', 'Sat'], key_session_day: 'Sat', minutes_per_session: 75, running: { mode: 'programmed' }, longest_run_min: 80, interval_experience: 'yes',
      race_sims: { choice: 'my_plan', type: 'full', frequency: 'weekly', preferred_day: 'Sat' } }) },
  { key: '04-4-strength-2-quality-long', athlete: { tier: 'app', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 90, interval_experience: 'yes',
      can_double: 'yes', strength_sessions_pref: 4, preferred_long_run_day: 'Sun', training_age: '3_plus_years' }) },
  { key: '05-beginner-no-running-home', athlete: { tier: 'app', level: 'beginner', equipment: HOME, training_locations: ['Home'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Sat'], key_session_day: 'Wed', minutes_per_session: 40, running: { mode: 'none' }, off_feet_includes: [], can_double: 'no' }) },
  { key: '06-advanced-80-100km', member: true, athlete: { tier: 'member', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R16, training_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], key_session_day: 'Tue', minutes_per_session: 75, running: { mode: 'programmed' }, longest_run_min: 110,
      interval_experience: 'yes', can_double: 'yes', runs_per_week: 5, training_age: '3_plus_years', preferred_long_run_day: 'Sun' }) },
  { key: '07-low-readiness-checkin', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes' }),
    checkin: { energy: 'poor', sleep: 'poor' } },
  { key: '08-own-plan-strength-own-days', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Sat', minutes_per_session: 50, strength_placement: 'own_days',
      running: { mode: 'own_plan', own_runs: [{ day: 'Tue', intensity: 'hard' }, { day: 'Thu', intensity: 'hard' }, { day: 'Sun', intensity: 'easy' }] } }) },
  { key: '09-coach-run-no-strength', member: true, athlete: { tier: 'member', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'], plan: 'coach_run' },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Thu', 'Sat'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 75, interval_experience: 'yes' }) },
  { key: '10-standard-compromised-6plus', athlete: { tier: 'app', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R8, training_days: ['Mon', 'Wed', 'Thu', 'Sat'], key_session_day: 'Wed', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 80, interval_experience: 'yes', hyathlon_races_count: '6_plus' }) },
  { key: '11-off-feet-erg-bike-sims', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'none' }, off_feet_includes: ['simulations', 'erg', 'bike'] }) },
  { key: '12-beginner-2-bridge', athlete: { tier: 'app', level: 'beginner', equipment: HOME, training_locations: ['Home', 'Outdoor'] },
    inputs: base({ race_date: R16, training_days: ['Tue', 'Thu', 'Sat', 'Sun'], key_session_day: 'Tue', minutes_per_session: 40, running: { mode: 'programmed' }, longest_run_min: 15, interval_experience: 'no' }) },
  { key: '13-beginner-1-walk-run', athlete: { tier: 'app', level: 'beginner', equipment: HOME, training_locations: ['Home', 'Outdoor'] },
    inputs: base({ race_date: R16, training_days: ['Mon', 'Wed', 'Fri', 'Sun'], key_session_day: 'Wed', minutes_per_session: 40, running: { mode: 'programmed' }, longest_run_min: 0 }) },
  { key: '14-4wk-2wk-taper-no-sims', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R4, training_days: ['Mon', 'Wed', 'Thu', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'programmed' }, longest_run_min: 50, interval_experience: 'yes', race_sims: { choice: 'none' } }) },
  { key: '15-doubles-3-days-no-double', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym'] },
    inputs: base({ race_option_id: 'hyathlon-doubles', race_date: R12, training_days: ['Tue', 'Thu', 'Sat'], key_session_day: 'Thu', minutes_per_session: 40, running: { mode: 'programmed' }, longest_run_min: 45, interval_experience: 'yes', can_double: 'no' }) },
  { key: '16-own-strength-classes', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Tue', 'Thu', 'Sat', 'Sun'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes',
      strength_choice: 'own', own_strength: [{ title: 'F45', days: ['Mon', 'Wed'], intensity: 'hard' }] }) },
  { key: '17-alternate-repeats-5-days', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sun'], key_session_day: 'Tue', minutes_per_session: 50, running: { mode: 'programmed' }, longest_run_min: 70, interval_experience: 'yes', repeat_preference: 'alternate' }) },
  { key: '18-two-days-a-week', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Wed', 'Sat'], key_session_day: 'Wed', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes', can_double: 'yes' }) },
  { key: '19-seven-days-30min', athlete: { tier: 'app', level: 'beginner', equipment: HOME, training_locations: ['Home', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], key_session_day: 'Thu', minutes_per_session: 30, running: { mode: 'programmed' }, longest_run_min: 25, interval_experience: 'no' }) },
  { key: '20-home-kb-own-easy-runs', athlete: { tier: 'app', level: 'intermediate', equipment: ['Kettlebell', 'Kettlebell or dumbbell'], training_locations: ['Home'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri'], key_session_day: 'Wed', minutes_per_session: 45, running: { mode: 'own_plan', own_runs: [{ day: 'Tue', intensity: 'easy' }, { day: 'Sat', intensity: 'easy' }] } }) },
  { key: '21-pro-sims-every-2nd-week', athlete: { tier: 'app', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_option_id: 'hyathlon-pro', race_date: R12, training_days: ['Mon', 'Tue', 'Thu', 'Fri', 'Sat'], key_session_day: 'Tue', minutes_per_session: 70, running: { mode: 'programmed' }, longest_run_min: 90,
      interval_experience: 'yes', can_double: 'sometimes', race_sims: { choice: 'my_plan', type: 'half', frequency: 'every_2nd_week', preferred_day: 'Sat' } }) },
  { key: '22-strength-endurance-3', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes',
      limiters: ['strength_endurance'], can_double: 'sometimes' }) },
  { key: '23-sims-once-before-race-8wk', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R8, training_days: ['Tue', 'Thu', 'Sat', 'Sun'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 70, interval_experience: 'yes',
      race_sims: { choice: 'my_plan', type: 'full', frequency: 'once_before_race' } }) },
  { key: '24-C-race-3-days-before-A', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R6, training_days: ['Mon', 'Wed', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes',
      other_events: [{ name: 'Fun run', type: '10k_or_shorter', date: '2026-11-11', event_priority: 'C' }] }) },
  { key: '25-low-readiness-advanced-member', member: true, athlete: { tier: 'member', level: 'advanced', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Thu', 'Sat', 'Sun'], key_session_day: 'Tue', minutes_per_session: 60, running: { mode: 'programmed' }, longest_run_min: 90, interval_experience: 'yes' }),
    checkin: { energy: 'poor', sleep: 'ok' } },
  { key: '26-off-feet-erg-only', athlete: { tier: 'app', level: 'beginner', equipment: ['Rower', 'Dumbbell', 'Kettlebell or dumbbell'], training_locations: ['Home'] },
    inputs: base({ race_date: R12, training_days: ['Tue', 'Thu', 'Sat'], key_session_day: 'Thu', minutes_per_session: 40, running: { mode: 'none' }, off_feet_includes: ['erg'] }) },
  { key: '27-same-two-weeks-repeats', athlete: { tier: 'app', level: 'intermediate', equipment: GYM, training_locations: ['Gym', 'Outdoor'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Wed', 'Fri', 'Sun'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'programmed' }, longest_run_min: 60, interval_experience: 'yes', repeat_preference: 'same_two_weeks' }) },
  { key: '28-6-strength-pref', athlete: { tier: 'app', level: 'advanced', equipment: GYM, training_locations: ['Gym'] },
    inputs: base({ race_date: R12, training_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], key_session_day: 'Wed', minutes_per_session: 50, running: { mode: 'own_plan', own_runs: [{ day: 'Sun', intensity: 'easy' }] },
      strength_sessions_pref: 6, can_double: 'yes' }) },
];

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
async function call(body: unknown, token: string) {
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function spent(): Promise<number> {
  if (!created.athletes.length) return 0;
  const { data } = await admin.from('generation_events').select('cost_usd').in('athlete_id', created.athletes);
  return (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let coach: { userId: string; token: string } | null = null;
async function getCoach() {
  if (coach) return coach;
  coach = await makeUser('coach');
  await admin.from('coaches').insert({ user_id: coach.userId, display_name: 'Reliability coach' });
  return coach;
}

interface Result { key: string; preview?: number; block?: string; checkin?: string; error?: string; cost?: number; calls?: number; failedCalls?: number; repairs?: number; errors?: string[]; ms?: number }
const results: Result[] = [];

async function run(p: Profile): Promise<Result> {
  const r: Result = { key: p.key };
  const t0 = Date.now();
  let athleteId = '';
  try {
    const u = await makeUser(p.key);
    const c = p.member ? await getCoach() : null;
    const { data, error } = await admin.from('athletes').insert({ user_id: u.userId, name: `Rel ${p.key}`, ...(c ? { coach_user_id: c.userId } : {}), ...p.athlete }).select('id').single();
    if (error) throw error;
    athleteId = data.id;
    created.athletes.push(athleteId);
    const token = c ? c.token : u.token;
    const pv = await call({ action: 'preview', athlete_id: athleteId, inputs: p.inputs }, token);
    r.preview = pv.status;
    if (pv.status !== 200) throw new Error(`preview ${pv.status}: ${JSON.stringify(pv.body).slice(0, 300)}`);
    const programId = pv.body.program.id;
    const cf = await call({ action: 'confirm', program_id: programId }, token);
    if (cf.status !== 202) throw new Error(`confirm ${cf.status}: ${JSON.stringify(cf.body).slice(0, 300)}`);
    for (;;) {
      await wait(10_000);
      const { data: b } = await admin.from('program_blocks').select('status').eq('program_id', programId).eq('block_no', 1).single();
      if (b && b.status !== 'generating' && b.status !== 'pending') { r.block = b.status; break; }
      if (Date.now() - t0 > 600_000) { r.block = 'timeout'; break; }
    }
    if (p.checkin && r.block === 'ready') {
      const ck = await call({ action: 'weekly_checkin', program_id: programId, week: 1, ...p.checkin }, token);
      if (ck.status === 202) {
        for (;;) {
          await wait(10_000);
          const { data: w } = await admin.from('weekly_checkins').select('status').eq('program_id', programId).eq('week', 1).single();
          if (w && w.status !== 'adjusting') { r.checkin = w.status; break; }
          if (Date.now() - t0 > 900_000) { r.checkin = 'timeout'; break; }
        }
      } else r.checkin = `${ck.status} ${JSON.stringify(ck.body).slice(0, 120)}`;
    }
  } catch (e) {
    r.error = String(e instanceof Error ? e.message : e);
  }
  if (athleteId) {
    const { data: ev } = await admin.from('generation_events').select('call_type, status, is_repair, cost_usd, error').eq('athlete_id', athleteId).order('id');
    r.cost = (ev ?? []).reduce((s, e) => s + Number(e.cost_usd ?? 0), 0);
    r.calls = ev?.length ?? 0;
    r.failedCalls = (ev ?? []).filter((e) => e.status === 'failed').length;
    r.repairs = (ev ?? []).filter((e) => e.is_repair).length;
    r.errors = (ev ?? []).filter((e) => e.error).map((e) => `${e.call_type}${e.is_repair ? ' (repair)' : ''}: ${e.error}`);
  }
  r.ms = Date.now() - t0;
  log(p.key, r.block ?? r.error?.slice(0, 120), r.checkin ? `check-in ${r.checkin}` : '', `$${(r.cost ?? 0).toFixed(3)}`, `${r.repairs ?? 0} repairs`);
  await Deno.writeTextFile(`${OUT}${p.key}.json`, JSON.stringify(r, null, 2));
  return r;
}

// Hard stop: pause generation one call's cost before the cap.
let watching = true, paused = false;
const watcher = (async () => {
  while (watching) {
    if (!paused && (await spent()) >= CAP - CALL_MARGIN) {
      await admin.from('app_settings').update({ value: 1 }).eq('key', 'generation_paused');
      paused = true;
      log('CAP REACHED: generation paused');
    }
    await wait(3_000);
  }
})();

try {
  const only = Deno.env.get('ONLY')?.split(',');
  const queue = P.filter((p) => !only || only.some((o) => p.key.startsWith(o)));
  const running = new Set<Promise<void>>();
  while (queue.length) {
    if (paused) { log('cap reached: not starting', queue.map((p) => p.key).join(', ')); break; }
    if (running.size >= CONCURRENCY || (await spent()) + (running.size + 1) * RESERVE > CAP) {
      if (running.size === 0) { log('cap would be passed: not starting', queue.map((p) => p.key).join(', ')); break; }
      await Promise.race(running);
      continue;
    }
    const p = queue.shift()!;
    log('start', p.key);
    const job = run(p).then((r) => { results.push(r); }).finally(() => running.delete(job));
    running.add(job);
    await wait(1_500);
  }
  await Promise.all(running);
  log('TOTAL spent', `$${(await spent()).toFixed(3)}`);
} finally {
  watching = false;
  await watcher;
  await admin.from('app_settings').update({ value: 0 }).eq('key', 'generation_paused');
  await Deno.writeTextFile(`${OUT}summary.json`, JSON.stringify(results, null, 2));
  if (created.athletes.length) {
    await admin.from('training_programs').delete().in('athlete_id', created.athletes);
    await admin.from('athletes').delete().in('id', created.athletes);
  }
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  const { data } = await admin.from('app_settings').select('value').eq('key', 'generation_paused').single();
  log('cleaned up', created.athletes.length, 'athletes; generation_paused is', data?.value);
}
