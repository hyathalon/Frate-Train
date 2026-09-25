import type { SupabaseClient } from './deps.ts';
import { HttpError } from './http.ts';

export interface AthleteRow {
  id: string;
  user_id: string | null;
  name: string | null;
  tier: 'app' | 'member';
  level: 'beginner' | 'intermediate' | 'advanced';
  equipment: string[] | null;
  training_locations: string[];
  timezone: string;
  coach_user_id: string | null;
  athlete_type: string | null;
}

export interface Caller {
  userId: string;
  role: 'coach' | 'athlete';
  athlete: AthleteRow | null; // the caller's own athlete row, if any
}

export const ATHLETE_COLUMNS =
  'id, user_id, name, tier, level, equipment, training_locations, timezone, coach_user_id, athlete_type';

/** Only a signed-in coach, or a signed-in user with an athlete row, may call the function. */
export async function authenticate(req: Request, admin: SupabaseClient): Promise<Caller> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // New-format API keys are never user tokens.
  if (!token || token.startsWith('sb_')) {
    throw new HttpError(401, 'not_signed_in', 'Please sign in to build a program.');
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(401, 'not_signed_in', 'Your session has expired. Please sign in again.');
  }
  const userId = data.user.id;
  const [coach, athlete] = await Promise.all([
    admin.from('coaches').select('user_id').eq('user_id', userId).maybeSingle(),
    admin.from('athletes').select(ATHLETE_COLUMNS).eq('user_id', userId).maybeSingle(),
  ]);
  if (coach.error || athlete.error) throw new Error('Could not load the account.');
  if (coach.data) return { userId, role: 'coach', athlete: athlete.data as AthleteRow | null };
  if (athlete.data) return { userId, role: 'athlete', athlete: athlete.data as AthleteRow };
  throw new HttpError(403, 'not_allowed', "This account isn't set up to build programs. Please contact your coach.");
}

/**
 * The athlete a request is about. Coaches may act for any athlete (athlete_id
 * required); athletes only for themselves. When building, member athletes are
 * refused because their coach builds their programs.
 */
export async function resolveAthlete(
  admin: SupabaseClient,
  caller: Caller,
  athleteId: unknown,
  { forBuilding }: { forBuilding: boolean },
): Promise<AthleteRow> {
  if (caller.role === 'coach') {
    if (typeof athleteId !== 'string' || !athleteId) {
      throw new HttpError(400, 'athlete_required', 'Choose the athlete this program is for.');
    }
    const { data, error } = await admin.from('athletes').select(ATHLETE_COLUMNS).eq('id', athleteId).maybeSingle();
    if (error) throw new Error('Could not load the athlete.');
    if (!data) throw new HttpError(404, 'athlete_not_found', 'That athlete could not be found.');
    return data as AthleteRow;
  }
  const own = caller.athlete!;
  if (athleteId !== undefined && athleteId !== null && athleteId !== own.id) {
    throw new HttpError(403, 'not_your_athlete', 'You can only build programs for yourself.');
  }
  if (forBuilding && own.tier === 'member') {
    throw new HttpError(403, 'coach_builds_member_programs', 'Your coach builds your program. Ask them if you need a change.');
  }
  return own;
}
