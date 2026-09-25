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

  const [previews, confirmations, ledger] = await Promise.all([
    countEvents(base().eq('counts_as', 'preview')),
    countEvents(base().eq('counts_as', 'confirmation').eq('paid_with', 'monthly')),
    admin.from('athlete_credit_ledger').select('delta').eq('athlete_id', athlete.id).eq('kind', 'confirmation'),
  ]);
  if (ledger.error) throw new Error(`Could not read credits: ${ledger.error.message}`);
  const credits = ledger.data.reduce((sum, row) => sum + row.delta, 0);

  return {
    kind: 'app',
    previews: counter(previews, setting(settings, 'app_monthly_outline_previews')),
    confirmations: counter(confirmations, setting(settings, 'app_monthly_confirmations')),
    credits: Math.max(0, credits),
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

function assertCoach(allowance: CoachAllowance) {
  if (allowance.builds.left > 0) return;
  throw new HttpError(429, 'daily_builds_used',
    `You've reached the safety limit of ${allowance.builds.limit} program builds in 24 hours.`,
    { allowance });
}
