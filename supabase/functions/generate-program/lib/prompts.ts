import type { AthleteRow } from './auth.ts';
import { type Candidates, formatExercises, formatRaceSessions, formatTemplates } from './candidates.ts';
import type { Outline, OutlineWeek } from './schemas.ts';

// The system prompt is identical for every call, so it is cached; everything
// that varies (athlete, dates, candidate lists) goes in the user message.

export interface ProgramInputs {
  race_name: string | null;
  race_date: string;
  days_available: number;
  weekly_hours: number | null;
  goal: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CoachProfile {
  strengths: string[];
  weaknesses: string[];
  priority_pillars: string[];
  limiters: string | null;
  coach_notes: string | null;
}

export function systemPrompt(referenceText: string): string {
  return `You are an expert Hyrox and hybrid-fitness coach planning training with The Hyathlon System, the methodology of Hyathlon Performance.

The reference material below (The Hyathlon System Booklet and the Master Coaching Handbook) is the primary basis for every decision, including the pillars. Use general coaching knowledge only where it is silent.

<reference>
${referenceText || '(No reference material could be loaded for this request. Use general coaching knowledge.)'}
</reference>

How this coach plans:
- The race date is fixed. The final week is the race week and part of the taper.
- Progress from general to specific as the race approaches, with a lighter (deload) week every 3 to 4 weeks.
- Address weaknesses early; sharpen strengths closer to the race.
- Add one new stimulus at a time (for example a second interval session, or a fourth session in the week). A new session starts as optional ("if you have time"); the athlete's core sessions are what adherence is measured on.
- Never plan more core sessions in a week than the days the athlete has available.
- Coach notes and limiters are private. Use them to shape the plan, but never quote, mention or hint at them in any text the athlete will see.`;
}

function athleteFacts(athlete: AthleteRow, inputs: ProgramInputs, coach: CoachProfile | null): string {
  const strengths = coach?.strengths.length ? coach.strengths : inputs.strengths;
  const weaknesses = coach?.weaknesses.length ? coach.weaknesses : inputs.weaknesses;
  const lines = [
    `Level: ${athlete.level}`,
    `Athlete type: ${athlete.athlete_type ?? 'hyrox'}`,
    `Trains at: ${athlete.training_locations.length ? athlete.training_locations.join(', ') : 'not specified'}`,
    `Equipment: ${athlete.equipment?.length ? athlete.equipment.join(', ') : 'bodyweight only'}`,
    `Days available per week: ${inputs.days_available}`,
    `Weekly training hours available: ${inputs.weekly_hours ?? 'not specified'}`,
    `Race: ${inputs.race_name ?? 'Hyrox'} on ${inputs.race_date}`,
    `Goal: ${inputs.goal}`,
    `Strengths: ${strengths.length ? strengths.join(', ') : 'not specified'}`,
    `Weaknesses: ${weaknesses.length ? weaknesses.join(', ') : 'not specified'}`,
  ];
  if (coach?.priority_pillars.length) lines.push(`Coach's priority pillars: ${coach.priority_pillars.join(', ')}`);
  if (coach?.limiters) lines.push(`Limiters (private): ${coach.limiters}`);
  if (coach?.coach_notes) lines.push(`Coach notes (private): ${coach.coach_notes}`);
  return lines.join('\n');
}

export function outlinePrompt(
  athlete: AthleteRow,
  inputs: ProgramInputs,
  coach: CoachProfile | null,
  window: { startDate: string; totalWeeks: number },
): string {
  return `Plan the season outline for this athlete.

<athlete>
${athleteFacts(athlete, inputs, coach)}
</athlete>

<program>
Start date (Monday of week 1): ${window.startDate}
Total weeks: ${window.totalWeeks} (week ${window.totalWeeks} is race week)
</program>

Outline every week from 1 to ${window.totalWeeks}:
- Group the weeks into phases (base, build, specific, taper) that cover every week in order. Shorter programs can skip base or build. The taper is the final 1 to 2 weeks and includes race week.
- For each week give the focus, the load (Low, Moderate or High), whether it is a deload, the number of core sessions (1 to ${inputs.days_available}), the number of optional sessions (0 to 2), 2 to 4 key sessions in a few words each, and the pillars it trains.
- Build up core sessions gradually; add at most one new stimulus per 4-week block, first as an optional session.`;
}

export function blockPrompt(args: {
  athlete: AthleteRow;
  inputs: ProgramInputs;
  coach: CoachProfile | null;
  outline: Outline;
  startWeek: number;
  endWeek: number;
  candidates: Candidates;
  weeklyMinutesMax: number | null;
}): string {
  const { athlete, inputs, coach, outline, startWeek, endWeek, candidates, weeklyMinutesMax } = args;
  const weeks: OutlineWeek[] = outline.weeks.filter((w) => w.week >= startWeek && w.week <= endWeek);
  const raceList = candidates.raceSessions.size
    ? `\n<race_sessions>\nid | station | name | dose | type | pillar | load\n${formatRaceSessions(candidates)}\n</race_sessions>\n`
    : '';
  return `Write weeks ${startWeek} to ${endWeek} of this athlete's program in detail, following the season outline.

<athlete>
${athleteFacts(athlete, inputs, coach)}
</athlete>

<season_outline>
${JSON.stringify(outline)}
</season_outline>

<targets>
${weeks.map((w) => `Week ${w.week}: ${w.phase}, ${w.load} load${w.deload ? ', deload' : ''}; exactly ${w.core_sessions} core sessions, up to ${w.optional_sessions} optional; focus: ${w.focus}`).join('\n')}
${weeklyMinutesMax !== null ? `Core sessions must total no more than ${weeklyMinutesMax} minutes in any week.` : ''}
</targets>

Rules for sessions:
- Use only the exercises, templates and race sessions listed below, by their exact id. Never invent an exercise or rename one.
- Strength, Circuit, Plyometric and Mobility sessions must use a template: set template_id, use the template's duration, and give exactly one item per slot, in slot order, whose movement pattern fits the slot (and body region, where the slot names one). Timing (rounds, sets, work and rest) comes from the template, so the dose for these items is reps or load only.
- Run, Erg and Hyrox sessions have no template: set template_id to null, use Running or Erg exercises${raceList ? ' or race sessions' : ''}, and write the dose (for example "40 min easy, conversational pace").
- Each item sets exactly one of exercise_id or race_session_id; the other is null.
- Optional sessions have optional true and a short slot key that stays the same across these weeks (for example "extra-intervals"), so the athlete's completions can be counted. Core sessions have optional false and slot null.
- Spread sessions sensibly across the week; don't put two hard sessions on consecutive days without reason.

<exercises>
id | name | movement | body region | methods | pillar
${formatExercises(candidates)}
</exercises>

<templates>
id | method | focus | duration | structure | slots
${formatTemplates(candidates)}
</templates>
${raceList}`;
}

export function repairPrompt(errors: string[]): string {
  return `Your answer broke these rules:
${errors.map((e) => `- ${e}`).join('\n')}

Return the complete corrected answer, following all the original rules.`;
}
