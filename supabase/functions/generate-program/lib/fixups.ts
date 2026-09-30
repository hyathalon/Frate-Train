import type { BlockWeek, Session } from './schemas.ts';
import { type BlockContext, raceWeekStrengthDays } from './validate.ts';

// Rules that are date arithmetic are applied in code rather than spending a
// repair turn on them.

const isStrength = (s: Session) => s.parts.some((p) => p.format === 'Strength');

/**
 * Race week: the short maintain strength session goes at least 5 days before the
 * race. A strength session on a later day moves to the earliest allowed training
 * day with room, as the day's second session when that day already has one.
 * Returns what moved, or null.
 */
export function placeRaceWeekStrength(
  week: BlockWeek,
  ctx: Pick<BlockContext, 'finalWeek' | 'raceDay' | 'trainingDays'>,
): string | null {
  if (week.week !== ctx.finalWeek) return null;
  const allowed = raceWeekStrengthDays(ctx.raceDay).filter((d) => ctx.trainingDays.includes(d));
  const moved: string[] = [];
  for (const s of week.sessions.filter((x) => isStrength(x) && !raceWeekStrengthDays(ctx.raceDay).includes(x.day))) {
    const to = allowed.find((d) => {
      const there = week.sessions.filter((x) => x.day === d);
      return there.length === 0 || (there.length === 1 && !isStrength(there[0]));
    });
    if (!to) continue;
    const from = s.day;
    const there = week.sessions.filter((x) => x.day === to);
    s.day = to as Session['day'];
    s.order_in_day = there.length ? 2 : 1;
    for (const x of there) x.order_in_day = 1;
    // The day it left: a remaining single session is the day's first.
    const left = week.sessions.filter((x) => x.day === from);
    if (left.length === 1) left[0].order_in_day = 1;
    moved.push(`"${s.title}" ${from} → ${to}`);
  }
  return moved.length ? `race-week strength moved: ${moved.join(', ')}` : null;
}

