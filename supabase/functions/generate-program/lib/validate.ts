import { type Candidates, slotMatches } from './candidates.ts';
import { type Block, type Outline, type OutlineWeek, TEMPLATE_METHODS } from './schemas.ts';

// Each validator returns plain-English errors. An empty list means valid.
// The same messages go back to Claude in the one automatic repair attempt.

export interface OutlineContext {
  totalWeeks: number;
  daysAvailable: number;
}

export function validateOutline(outline: Outline, ctx: OutlineContext): string[] {
  const errors: string[] = [];
  const { weeks, phases } = outline;

  if (weeks.length !== ctx.totalWeeks) {
    errors.push(`The outline must have exactly ${ctx.totalWeeks} weeks; it has ${weeks.length}.`);
  }
  weeks.forEach((w, i) => {
    if (w.week !== i + 1) errors.push(`Weeks must be numbered 1 to ${ctx.totalWeeks} in order; position ${i + 1} is week ${w.week}.`);
    if (w.core_sessions < 1 || w.core_sessions > ctx.daysAvailable) {
      errors.push(`Week ${w.week}: core_sessions must be between 1 and ${ctx.daysAvailable} (days available); it is ${w.core_sessions}.`);
    }
    if (w.optional_sessions < 0 || w.optional_sessions > 2) {
      errors.push(`Week ${w.week}: optional_sessions must be between 0 and 2; it is ${w.optional_sessions}.`);
    }
    if (w.core_sessions + w.optional_sessions > 7) {
      errors.push(`Week ${w.week}: core plus optional sessions can't exceed 7.`);
    }
    if (w.pillars.length === 0) errors.push(`Week ${w.week}: list at least one pillar.`);
  });

  const last = weeks[weeks.length - 1];
  if (last && last.phase !== 'taper') errors.push('The final (race) week must be in the taper phase.');

  // Phases must cover weeks 1..N without gaps or overlaps, and match each week's phase.
  const sorted = [...phases].sort((a, b) => a.start_week - b.start_week);
  let expected = 1;
  for (const p of sorted) {
    if (p.start_week !== expected || p.end_week < p.start_week) {
      errors.push(`Phases must cover weeks 1 to ${ctx.totalWeeks} without gaps or overlaps (problem at "${p.name}").`);
      break;
    }
    expected = p.end_week + 1;
  }
  if (expected !== ctx.totalWeeks + 1 && errors.every((e) => !e.startsWith('Phases'))) {
    errors.push(`Phases must end at week ${ctx.totalWeeks}.`);
  }
  for (const w of weeks) {
    const phase = sorted.find((p) => w.week >= p.start_week && w.week <= p.end_week);
    if (phase && phase.kind !== w.phase) {
      errors.push(`Week ${w.week} is marked "${w.phase}" but falls in the "${phase.kind}" phase.`);
    }
  }
  return errors;
}

export interface BlockContext {
  startWeek: number;
  endWeek: number;
  outlineWeeks: OutlineWeek[];
  daysAvailable: number;
  weeklyMinutesMax: number | null; // weekly hours × 60 plus 10%, if the athlete gave hours
  candidates: Candidates;
  ownCustomExerciseIds?: Set<string>; // later blocks: the athlete's own custom exercises
}

export function validateBlock(block: Block, ctx: BlockContext): string[] {
  const errors: string[] = [];
  const expectedWeeks = ctx.endWeek - ctx.startWeek + 1;
  if (block.weeks.length !== expectedWeeks) {
    errors.push(`The block must have exactly ${expectedWeeks} weeks (weeks ${ctx.startWeek} to ${ctx.endWeek}); it has ${block.weeks.length}.`);
  }

  block.weeks.forEach((week, i) => {
    const label = `Week ${week.week}`;
    if (week.week !== ctx.startWeek + i) {
      errors.push(`Weeks must be numbered ${ctx.startWeek} to ${ctx.endWeek} in order; position ${i + 1} is week ${week.week}.`);
    }
    const plan = ctx.outlineWeeks.find((w) => w.week === week.week);
    const core = week.sessions.filter((s) => !s.optional);
    const optional = week.sessions.filter((s) => s.optional);
    if (plan && core.length !== plan.core_sessions) {
      errors.push(`${label}: the outline has ${plan.core_sessions} core sessions; the block has ${core.length}.`);
    }
    if (plan && optional.length > plan.optional_sessions) {
      errors.push(`${label}: at most ${plan.optional_sessions} optional sessions; the block has ${optional.length}.`);
    }
    const coreDays = new Set(core.map((s) => s.day));
    if (coreDays.size > ctx.daysAvailable) {
      errors.push(`${label}: core sessions use ${coreDays.size} days but the athlete has ${ctx.daysAvailable}.`);
    }
    const coreMinutes = core.reduce((sum, s) => sum + s.duration_min, 0);
    if (ctx.weeklyMinutesMax !== null && coreMinutes > ctx.weeklyMinutesMax) {
      errors.push(`${label}: core sessions total ${coreMinutes} min, over the athlete's ${ctx.weeklyMinutesMax} min a week.`);
    }

    week.sessions.forEach((s, j) => {
      const where = `${label}, session ${j + 1} ("${s.title}")`;
      if (s.optional && !s.slot) errors.push(`${where}: optional sessions need a slot key.`);
      if (s.duration_min < 10 || s.duration_min > 180) errors.push(`${where}: duration must be 10 to 180 minutes.`);
      if (s.items.length === 0) errors.push(`${where}: needs at least one item.`);

      s.items.forEach((item, k) => {
        const at = `${where}, item ${k + 1}`;
        if ((item.exercise_id === null) === (item.race_session_id === null)) {
          errors.push(`${at}: set exactly one of exercise_id or race_session_id.`);
          return;
        }
        if (item.exercise_id !== null && !ctx.candidates.exercises.has(item.exercise_id)
            && !ctx.ownCustomExerciseIds?.has(item.exercise_id)) {
          errors.push(`${at}: ${item.exercise_id} is not in the candidate exercise list.`);
        }
        if (item.race_session_id !== null && !ctx.candidates.raceSessions.has(item.race_session_id)) {
          errors.push(`${at}: ${item.race_session_id} is not in the candidate race session list.`);
        }
      });

      const needsTemplate = (TEMPLATE_METHODS as readonly string[]).includes(s.method);
      if (needsTemplate && !s.template_id) {
        errors.push(`${where}: ${s.method} sessions must use a session template.`);
      }
      if (s.template_id) {
        const template = ctx.candidates.templates.get(s.template_id);
        if (!template) {
          errors.push(`${where}: template ${s.template_id} is not in the candidate template list.`);
          return;
        }
        if (template.method !== s.method) errors.push(`${where}: template ${template.id} is a ${template.method} template, not ${s.method}.`);
        if (template.duration_min !== s.duration_min) {
          errors.push(`${where}: duration must match template ${template.id} (${template.duration_min} min).`);
        }
        if (s.items.length !== template.slots.length) {
          errors.push(`${where}: template ${template.id} has ${template.slots.length} slots; the session has ${s.items.length} items.`);
        } else {
          template.slots.forEach((slot, k) => {
            const exercise = s.items[k].exercise_id ? ctx.candidates.exercises.get(s.items[k].exercise_id!) : undefined;
            if (exercise && !slotMatches(slot, exercise)) {
              errors.push(`${where}, item ${k + 1}: ${exercise.id} (${exercise.movement_pattern}) doesn't fit slot "${slot.label}" [${slot.movement_patterns.join(', ')}]${slot.body_region ? ` (${slot.body_region})` : ''}.`);
            }
          });
        }
      }
    });
  });
  return errors;
}
