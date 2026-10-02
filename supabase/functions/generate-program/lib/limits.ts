import type { AthleteRow, Caller } from './auth.ts';
import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';
import { monthWindow } from './time.ts';
import { type Settings, setting } from './settings.ts';

// Only successful generations that used an allowance count (counts_as is set).
// Next blocks, hold blocks, re-plans, retries, check-ins and edits never count.

export interface Counter {
  used: number;
  limit: number;
  left: number;
}

export interface AppAllowance {
  kind: 'app';
  previews: Counter;
  confirmations: Counter;
  credits: number; // purchased confirmations left (used after the monthly ones)
  replans: Counter; // re-plans included in the athlete's plan, in the current window
  replanCredits: number; // purchased re-plans left ($10 each), used after the included ones
  resetsOn: string; // first day of next month, athlete's timezone
  timezone: string;
}

export interface CoachAllowance {
  kind: 'coach';
  builds: Counter;
  resetsAt: string | null; // when the oldest build in the window drops out
}

function counter(used: number, limit: number): Counter {
  return { used, limit, left: Math.max(0, limit - used) };
}

async function countEvents(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`Could not count generations: ${error.message}`);
  return count ?? 0;
}

export async function appAllowance(
  admin: SupabaseClient,
  athlete: AthleteRow,
  settings: Settings,
  now: Date,
): Promise<AppAllowance> {
  const { start, resetsOn } = monthWindow(now, athlete.timezone);
  const since = start.toISOString();
  // Only builds the athlete started count; a coach building for them doesn't.
  const base = () =>
    admin
      .from('generation_events')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athlete.id)
      .eq('user_id', athlete.user_id ?? '00000000-0000-0000-0000-000000000000')
      .eq('status', 'ok')
      .gte('created_at', since);

  const window = replanWindow(athlete, settings);
  const [previews, confirmations, replans, ledger] = await Promise.all([
    countEvents(base().eq('counts_as', 'preview')),
    countEvents(base().eq('counts_as', 'confirmation').eq('paid_with', 'monthly')),
    window ? countEvents(replanBase(admin, athlete, window.since)) : Promise.resolve(0),
    admin.from('athlete_credit_ledger').select('kind, delta').eq('athlete_id', athlete.id),
  ]);
  if (ledger.error) throw new Error(`Could not read credits: ${ledger.error.message}`);
  const balance = (kind: string) => ledger.data.filter((r) => r.kind === kind).reduce((sum, row) => sum + row.delta, 0);
  const credits = balance('confirmation');

  return {
    kind: 'app',
    previews: counter(previews, setting(settings, 'app_monthly_outline_previews')),
    confirmations: counter(confirmations, setting(settings, 'app_monthly_confirmations')),
    credits: Math.max(0, credits),
    replans: counter(replans, window?.included ?? 0),
    replanCredits: Math.max(0, balance('replan')),
    resetsOn,
    timezone: athlete.timezone,
  };
}

export async function coachAllowance(
  admin: SupabaseClient,
  userId: string,
  settings: Settings,
  now: Date,
): Promise<CoachAllowance> {
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await admin
    .from('generation_events')
    .select('created_at')
    .eq('user_id', userId)
    .eq('status', 'ok')
    .not('counts_as', 'is', null)
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not count builds: ${error.message}`);
  const limit = setting(settings, 'coach_daily_program_builds');
  const oldest = data[0]?.created_at;
  return {
    kind: 'coach',
    builds: counter(data.length, limit),
    resetsAt: oldest ? new Date(new Date(oldest).getTime() + 24 * 3600 * 1000).toISOString() : null,
  };
}

/** The allowance that applies to this caller building for this athlete. */
export function allowanceFor(
  admin: SupabaseClient,
  caller: Caller,
  athlete: AthleteRow,
  settings: Settings,
  now: Date,
): Promise<AppAllowance | CoachAllowance> {
  return caller.role === 'coach'
    ? coachAllowance(admin, caller.userId, settings, now)
    : appAllowance(admin, athlete, settings, now);
}

export function assertCanPreview(allowance: AppAllowance | CoachAllowance) {
  if (allowance.kind === 'coach') return assertCoach(allowance);
  if (allowance.previews.left > 0) return;
  throw new HttpError(429, 'monthly_previews_used',
    `You've used your ${allowance.previews.limit} season previews for this month.`,
    { allowance });
}

/** Returns which allowance a confirmation will use. */
export function assertCanConfirm(allowance: AppAllowance | CoachAllowance): 'monthly' | 'credit' | null {
  if (allowance.kind === 'coach') {
    assertCoach(allowance);
    return null;
  }
  if (allowance.confirmations.left > 0) return 'monthly';
  if (allowance.credits > 0) return 'credit';
  throw new HttpError(429, 'monthly_confirmations_used',
    `You've used your ${allowance.confirmations.limit} program confirmations for this month.`,
    { allowance });
}

/**
 * The re-plans an app plan includes, and since when they're counted:
 * - app_weekly: 1 per 4 weeks of paid time; the first after 4 paid weeks; unused
 *   don't carry over (each 4-week window starts afresh).
 * - app_12wk: 3 in the 12-week block.
 * No plan yet (before billing): none included.
 */
export function replanWindow(athlete: AthleteRow, settings: Settings): { included: number; since: string } | null {
  const start = athlete.plan_started_at;
  if (!start) return null;
  if (athlete.plan === 'app_12wk') return { included: setting(settings, 'replan_12wk_included'), since: start };
  if (athlete.plan === 'app_weekly') {
    const every = setting(settings, 'replan_weekly_every_weeks');
    const paid = athlete.paid_weeks ?? 0;
    if (paid < every) return { included: 0, since: start };
    // Each block of 4 paid weeks opens a window with 1 re-plan, from the end of that block.
    const since = new Date(new Date(`${start}T00:00:00Z`).getTime() + Math.floor(paid / every) * every * 7 * 86_400_000).toISOString().slice(0, 10);
    return { included: 1, since };
  }
  return null;
}

function replanBase(admin: SupabaseClient, athlete: AthleteRow, since: string) {
  return admin.from('generation_events').select('id', { count: 'exact', head: true })
    .eq('athlete_id', athlete.id).eq('status', 'ok').eq('counts_as', 'replan').eq('paid_with', 'included').gte('created_at', since);
}

/**
 * Which allowance an athlete-requested re-plan ("Rebuild my plan", regenerate a week)
 * uses: coaching plans, members and coaches none (unlimited); app plans the included
 * re-plans, then purchased ones ($10 each). Charged only on success.
 */
export function assertCanReplan(allowance: AppAllowance | CoachAllowance | { kind: 'member' }): 'included' | 'credit' | null {
  if (allowance.kind !== 'app') return null;
  if (allowance.replans.left > 0) return 'included';
  if (allowance.replanCredits > 0) return 'credit';
  throw new HttpError(429, 'replans_used',
    "You've used the re-plans included in your plan. Get another for $10, or keep editing sessions yourself for free.",
    { allowance });
}

/** Coach credits (separate from re-plans): 1 credit = $30; a written reply costs 1, a short video 2, a Q&A call 4. */
export async function coachCredits(admin: SupabaseClient, athleteId: string): Promise<number> {
  const { data, error } = await admin.from('athlete_credit_ledger').select('delta').eq('athlete_id', athleteId).eq('kind', 'coach_credit');
  if (error) throw new Error(`Could not read coach credits: ${error.message}`);
  return Math.max(0, data.reduce((sum, r) => sum + r.delta, 0));
}

export function coachCreditCost(settings: Settings, kind: 'reply' | 'video' | 'call'): number {
  return setting(settings, `coach_credit_cost_${kind}`);
}

function assertCoach(allowance: CoachAllowance) {
  if (allowance.builds.left > 0) return;
  throw new HttpError(429, 'daily_builds_used',
    `You've reached the safety limit of ${allowance.builds.limit} program builds in 24 hours.`,
    { allowance });
}
