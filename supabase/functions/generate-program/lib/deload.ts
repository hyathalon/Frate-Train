import type { BlockWeek } from './schemas.ts';
import { type BlockContext, coreMinutes, matchable, serves, sessionTotal, weeklyNeeds } from './validate.ts';

// Deload weeks are trimmed in code to 60–70% of the previous week's core minutes
// (deload_volume_min / _max), instead of relying on Claude to size them.
//
// Only safe edits: shorten parts whose timing comes from the database (so the
// dose doesn't state the minutes), then drop extra parts from multi-part
// sessions. Strength parts, Run parts and the key session are never touched,
// sessions stay above the deload minimum length, and the weekly mix still holds.
// If the week can't be brought into range, it is left for the validator (and a
// repair turn) to deal with.

const SHORTENABLE = ['HIIT', 'Aerobic', 'AMRAP', 'EMOM', 'ForTime'];
const STEP_MIN = 5;

export type DeloadContext = Pick<
  BlockContext,
  'frame' | 'candidates' | 'finalWeek' | 'settings' | 'minutesPerSession' | 'running' | 'outlineWeeks'
>;

/** Trims a deload week in place. Returns a short description of what changed, or null. */
export function trimDeload(
  week: BlockWeek,
  previous: BlockWeek,
  ctx: DeloadContext,
  target?: { min: number; max: number }, // taper weeks: a share of usual volume, with previous = the usual week
): string | null {
  if (week.progression.lever !== 'deload' || week.week === ctx.finalWeek) return null;
  const before = coreMinutes(previous, ctx);
  if (before <= 0) return null;
  const ratio = () => coreMinutes(week, ctx) / before;
  const deloadMin = target?.min ?? ctx.settings.deloadMin;
  const deloadMax = target?.max ?? ctx.settings.deloadMax;
  const final = week.week === ctx.finalWeek;
  const sessionMin = Math.floor(ctx.minutesPerSession * ctx.settings.deloadSessionMinRatio);
  const core = week.sessions.filter((s) => !s.optional);
  const plan = ctx.outlineWeeks.find((w) => w.week === week.week);
  const needs = weeklyNeeds(ctx.running, core.length, plan?.strength_sessions ?? 0);
  const mixHolds = () => final || matchable(needs, core.map(serves));
  const start = ratio();
  let changes = 0;

  while (ratio() > deloadMax) {
    let done = false;
    // 1. Shorten the longest shortenable part by 5 minutes.
    const shortenable = core
      .filter((s) => !s.key_session && sessionTotal(s, final, ctx) - STEP_MIN >= sessionMin)
      .flatMap((s) => s.parts.filter((p) => SHORTENABLE.includes(p.format) && p.minutes - STEP_MIN >= formatMin(ctx, p.format)))
      .sort((a, b) => b.minutes - a.minutes);
    for (const part of shortenable) {
      part.minutes -= STEP_MIN;
      if (ratio() >= deloadMin - 0.05) {
        done = true;
        break;
      }
      part.minutes += STEP_MIN;
    }
    // 2. Drop an extra non-strength, non-run part from a multi-part session.
    if (!done) {
      outer: for (const s of core.filter((x) => !x.key_session && x.parts.length > 1)) {
        for (let i = s.parts.length - 1; i >= 0; i--) {
          const part = s.parts[i];
          if (part.format === 'Strength' || part.format === 'Run') continue;
          if (sessionTotal(s, final, ctx) - part.minutes < sessionMin) continue;
          s.parts.splice(i, 1);
          if (ratio() >= deloadMin - 0.05 && mixHolds()) {
            done = true;
            break outer;
          }
          s.parts.splice(i, 0, part);
        }
      }
    }
    if (!done) break;
    changes++;
  }
  if (!changes) return null;
  return `deload trimmed from ${Math.round(start * 100)}% to ${Math.round(ratio() * 100)}% of the previous week (${changes} change${changes === 1 ? '' : 's'})`;
}

function formatMin(ctx: DeloadContext, format: string): number {
  const r = ctx.candidates.formats.get(format)?.rules?.minutes;
  return Array.isArray(r) ? Number(r[0]) : STEP_MIN;
}
