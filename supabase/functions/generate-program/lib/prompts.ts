import type { AthleteRow } from './auth.ts';
import { type Candidates, formatExercises, formatFormats, formatRaceSessions, formatTemplates, type RaceOption } from './candidates.ts';
import { type Timing, weeklyNeeds } from './validate.ts';
import type { BlockWeek, Outline, OutlineWeek, RunningMode } from './schemas.ts';

// The system prompt is identical for every call, so it is cached; everything
// that varies (athlete, dates, candidate lists) goes in the user message.

export interface ProgramInputs {
  race_option_id: string;
  race_name: string | null;
  race_date: string;
  training_days: string[]; // e.g. ['Mon', 'Wed', 'Fri', 'Sat']
  key_session_day: string; // one of training_days
  minutes_per_session: number;
  goal: string;
  strengths: string[];
  weaknesses: string[];
  longest_run_min?: number | null; // longest run in the last 3 weeks, minutes
  cross_training_preferences?: string[]; // ranked, most preferred first
  running: {
    mode: RunningMode; // programmed | own_plan | none
    own_runs: { day: string; intensity: 'hard' | 'easy' }[]; // own_plan only
  };
}

// Frates's session design rules. Static text, so it stays in the cached system prompt.
const SESSION_DESIGN_RULES = `Session design rules (these take priority over the reference material for intensity and session design):

Intensity is RPE, never fixed paces, splits, watts or loads
- Write every intensity as RPE plus a feel word. Never write "Zone 1" or "Zone 2" in athlete-facing text.
  RPE <5 Easy | RPE 6-7 Steady | RPE 8-8.5 Mod. Hard (15 km to half-marathon effort; typical hybrid-race run effort) | RPE 8.5-9.5 Hard (10 km to 5 km effort) | RPE 9.5-10 Very Hard (3 km effort and faster).
- RPE <5 is only for recovery sessions (the day after a medium-hard session or race), warm-ups and cool-downs.
- Easy runs, long runs and steady aerobic work are RPE 6-7.
- Loads are by feel ("a load you can push 25 m at RPE 8") or race standard. Never write kg, watts, splits or paces.

Session types (Steve Magness classifications)
- Recovery (RPE <5). Easy/steady (RPE 6-7, optional 30-60 s strides or surges). Long run (RPE 6-7, usually 50-90 min, optional RPE 8-8.5 segments).
- Progression (RPE 6-7 building to 8-8.5). Aerobic threshold (RPE 7-8). Lactate threshold (RPE 8-8.5, often in blocks, e.g. 20 min + short easy + 10 min).
- Critical velocity (RPE 8.5-9.5). VO2max (RPE 9-10, 2-5 min reps, rest about half the work time; focused blocks only, once threshold and critical velocity work are established).
- Speed or hill sprints (RPE 9.5-10, short, full recovery; stop when mechanics break down).
- Compromised run + station (RPE 8-9.5).
- Cross-training uses the same types on air bike, BikeErg, elliptical, SkiErg, rower (3/4 slide to manage load) and pool running (a zero-impact threshold option).

Deciding each session
- Name the pillar and one-line adaptation. Find the last similar session; with no history, write a conservative benchmark.
- Decide build (near the top of the challenge window) or maintain (about 60% effort).
- Default to a just-manageable step. A "go to the well" session is rare, only when fresh, and followed by 1-3 cementing sessions.
- Change ONE thing versus the last similar session: speed/RPE, recovery (length, style, speed, or something done in the recovery), rep length, terrain/modality, volume, density, inserted "stuff" (clearing segment, sprints, strength), surges, or feedback constraints.
- Extend = more volume or longer reps at the same RPE. Qualify = same work at higher output, or with less recovery.
- Surges and feedback constraints (hidden splits, unknown rep counts) are mainly for the specific phase.
- The last rep should feel fast and controlled, except in deliberate hard sessions where productive fatigue (holding form while slowing) is fine.

Writing the dose
- Warm-up and cool-down at RPE <5 (strides or drills can be added to the warm-up).
- Give sets as planned with a range the athlete can choose from, e.g. "3 sets (2-4) x 8 min @ RPE 8-8.5 Mod. Hard / 2 min easy".
- Give the long run as planned minutes with a range, e.g. "60 min (50-70) @ RPE 6-7 Steady".
- Start the long run at or just below the athlete's longest run in the last 3 weeks, then extend about 5-10 min per step, with a lighter week in each block.
- Place insertions by time, e.g. "4 x 10 s hill sprints @ RPE 9.5-10 at the 20 min mark of the run, walk-down recovery".
- For cross-training sessions, use the cue to list alternatives from the athlete's equipment, most preferred first, e.g. "Alternatives: elliptical or bike, same time and RPE". Never prescribe equipment the athlete doesn't have.

The week
- Place key sessions first. Repeat a stimulus every 7-14 days when building and every 14+ days when maintaining; neural work (strides, sprints, power) little and often.
- Follow key sessions with recovery (RPE <5) or rest. Fill the remaining volume with RPE 6-7.
- No heavy lower-body, lunge or sled work within 24-48 h before a key run. No "go to the well" run within 48 h of a hard station or strength day.
- Count station and erg work in weekly load.

Niggles and soreness
- Where the athlete has a niggle or soreness, make the affected running sessions fully off-feet on their preferred cross-training, with the same purpose and RPE. Never mix running and cross-training in that session.
- When it clears, build back over about 2 weeks. Week 1: easy runs only at RPE 6-7, about 50-75% of the previous duration, other sessions off-feet, no hills, sprints or intensity. Week 2: back towards normal volume, with one key run session if symptom-free. If symptoms return, go back a step.
- Say "if it persists or worsens, check with your medical professional". Never give medical advice.`;

export interface CoachProfile {
  strengths: string[];
  weaknesses: string[];
  priority_pillars: string[];
  limiters: string | null;
  coach_notes: string | null;
}

// The athlete's running choice (in <athlete>) decides where running goes.
// Takes priority over the reference material's running programs.
const RUNNING_RULES = `Running (follow the athlete's running choice in the athlete facts; this takes priority over the reference material):
- "Program my running": plan their running with Run parts (run_type key, easy, long or recovery), using the session design rules above for types, RPE, ranges and long-run progression. Every week needs running suited to the phase: a key run, plus an easy or long run where days allow. Start the long run at or just below their longest run in the last 3 weeks, then extend it by at most 10 minutes at a time. A long run may make its session longer than the usual minutes (up to 120 min).
- "I already have a run plan": don't plan any runs (no Run parts); they run on their own days. Plan around them: no heavy lower-body strength or sled work the day before a hard run (and preferably not two days before). Count their runs in the week's load.
- "No running": no Run parts. Apply the session types, RPE scale and progression rules to ergs and other cross-training instead (air bike, BikeErg, SkiErg, rower), and to sleds, circuits and the other formats.
- For every choice, running also appears as run segments in race simulations (at the race's run distance) and as short run segments in compromised parts (at most 25% of that part's time).
- The niggle rules apply to erg and station work in the same way: swap to a pain-free off-feet or upper-body option with the same purpose and RPE.`;

const FORMAT_RULES = `Session structure:
- A session is a warm-up, then 1 to 3 parts, then a cool-down. The warm-up and cool-down are added for you; give only the parts. The parts' minutes plus warm-up and cool-down must equal the athlete's minutes per session (within 5 minutes).
- Each part has one format. Timed formats (Circuit, Tabata, HIIT, Mobility, Aerobic) are dosed by time and RPE only, never reps. Rep formats (AMRAP, EMOM, ForTime, Station, RaceSim, Compromised) give reps or distance. Strength gives sets × reps plus a load by feel (e.g. "3 × 8 (6-10), moderate load, RPE 7"). Plyometrics give foot contacts.
- Timing (work, rest, rounds, blocks) comes from the database; don't restate it in the dose.
- Weekly mix (core sessions, each need in a different session): with running programmed, 3 sessions = a key run, a strength session and a hybrid/station session; 4 or more = a key run, an easy or long run, a strength session and a hybrid/station session. Otherwise, 2 or more sessions = at least one strength session and one conditioning/station session. Race week is exempt.
- Plyometrics go first, straight after the warm-up, with full recovery.
- Tabata is classic only: 20 s maximal work / 10 s complete rest × 8 rounds per 4-minute block, 1 exercise or 2 alternating, Tabata-suitable exercises only (marked T). For beginners, cue it "hard but controlled".
- Give a short technique cue (in cue) for race-station exercises and for exercises that target the athlete's weaknesses.

Progression (frequency, intensity, volume — one lever per week):
- Frequency: sessions per week (a new session is added as optional first).
- Intensity: load, RPE, a harder variation, or a tougher work:rest ratio.
- Volume: more exercises, sets, rounds, time cap or foot contacts.
- Every week progresses load, sets, reps or density; never repeat a session unchanged. Deload weeks are about 60–70% of the previous week.`;

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
- Coach notes and limiters are private. Use them to shape the plan, but never quote, mention or hint at them in any text the athlete will see.

${SESSION_DESIGN_RULES}

${RUNNING_RULES}

${FORMAT_RULES}`;
}

const RUNNING_LABEL: Record<RunningMode, string> = {
  programmed: 'Program my running',
  own_plan: 'I already have a run plan',
  none: 'No running',
};

function athleteFacts(athlete: AthleteRow, inputs: ProgramInputs, coach: CoachProfile | null, race: RaceOption): string {
  const strengths = coach?.strengths.length ? coach.strengths : inputs.strengths;
  const weaknesses = coach?.weaknesses.length ? coach.weaknesses : inputs.weaknesses;
  const lines = [
    `Level: ${athlete.level}`,
    `Athlete type: ${athlete.athlete_type ?? 'hyrox'}`,
    `Trains at: ${athlete.training_locations.length ? athlete.training_locations.join(', ') : 'not specified'}`,
    `Equipment: ${athlete.equipment?.length ? athlete.equipment.join(', ') : 'bodyweight only'}`,
    `Training days: ${inputs.training_days.join(', ')} (${inputs.training_days.length} days; sessions only on these days)`,
    `Key session day: ${inputs.key_session_day}`,
    `Minutes per session: ${inputs.minutes_per_session}`,
    `Race: ${inputs.race_name ?? race.label} (${race.label}) on ${inputs.race_date}`,
    `Goal: ${inputs.goal}`,
    `Strengths: ${strengths.length ? strengths.join(', ') : 'not specified'}`,
    `Weaknesses: ${weaknesses.length ? weaknesses.join(', ') : 'not specified'}`,
    `Running choice: ${RUNNING_LABEL[inputs.running.mode]}`,
    ...(inputs.running.mode === 'own_plan'
      ? [`Their own runs: ${inputs.running.own_runs.map((r) => `${r.day} (${r.intensity})`).join(', ') || 'days not given'}`]
      : []),
    `Longest run in the last 3 weeks: ${inputs.longest_run_min ? `${inputs.longest_run_min} min` : 'not specified'}`,
    `Cross-training preferences (most preferred first): ${inputs.cross_training_preferences?.length ? inputs.cross_training_preferences.join(', ') : 'not specified (use the equipment list)'}`,
  ];
  if (coach?.priority_pillars.length) lines.push(`Coach's priority pillars: ${coach.priority_pillars.join(', ')}`);
  if (coach?.limiters) lines.push(`Limiters (private): ${coach.limiters}`);
  if (coach?.coach_notes) lines.push(`Coach notes (private): ${coach.coach_notes}`);
  return lines.join('\n');
}

function raceFacts(race: RaceOption): string {
  return `${race.label}${race.run_distance_m ? `, ${race.run_distance_m} m run segments` : ''}:\n${race.segments.map((s) => `- ${s}`).join('\n')}`;
}

export function outlinePrompt(
  athlete: AthleteRow,
  inputs: ProgramInputs,
  coach: CoachProfile | null,
  race: RaceOption,
  window: { startDate: string; totalWeeks: number },
): string {
  const days = inputs.training_days.length;
  return `Plan the season outline for this athlete.

<athlete>
${athleteFacts(athlete, inputs, coach, race)}
</athlete>

<race_format>
${raceFacts(race)}
</race_format>

<program>
Start date (Monday of week 1): ${window.startDate}
Total weeks: ${window.totalWeeks} (week ${window.totalWeeks} is race week)
</program>

Outline every week from 1 to ${window.totalWeeks}:
- Group the weeks into phases (base, build, specific, taper) that cover every week in order. Shorter programs can skip base or build. The taper is the final 1 to 2 weeks and includes race week.
- For each week give the focus, the load (Low, Moderate or High), whether it is a deload, the one progression lever (week 1 "start", deload weeks "deload", otherwise frequency, intensity or volume), the number of core sessions, the number of optional sessions (0 to 2), the key session (on ${inputs.key_session_day}), 2 to 4 key sessions in a few words each, and the pillars it trains.
- Core sessions per week are never more than ${days} (the athlete trains ${days} days). Optional sessions go on the same days.
- Plan the weekly mix and running for the athlete's running choice (${RUNNING_LABEL[inputs.running.mode]}).
- Build up core sessions gradually; add at most one new stimulus per 4-week block, first as an optional session.
- In the summary, describe core and optional sessions accurately: core sessions are the week's planned sessions; optional ones are extras "if you have time".`;
}

export function blockPrompt(args: {
  athlete: AthleteRow;
  inputs: ProgramInputs;
  coach: CoachProfile | null;
  outline: Outline;
  startWeek: number;
  endWeek: number;
  candidates: Candidates;
  frame: { warmup_min: number; cooldown_min: number };
  tabataTimings: Timing[];
  availableFormats: Set<string>;
  plyoContacts: [number, number] | null; // this athlete's foot-contact range per session
  runExerciseIds: string[];
  targetWeeks?: OutlineWeek[]; // overrides the outline's targets (weekly adjustments)
  previousWeek?: BlockWeek; // the week before, for progression
  adjustment?: string; // why this week is being rewritten
}): string {
  const { athlete, inputs, coach, outline, startWeek, endWeek, candidates, frame, tabataTimings } = args;
  const weeks: OutlineWeek[] = args.targetWeeks ?? outline.weeks.filter((w) => w.week >= startWeek && w.week <= endWeek);
  const adjustment = args.adjustment
    ? `\n<adjustment>\n${args.adjustment}\n</adjustment>\n`
    : '';
  const previous = args.previousWeek
    ? `\n<previous_week>\n${JSON.stringify(args.previousWeek)}\n</previous_week>\nProgress from the previous week; never repeat one of its sessions unchanged.\n`
    : '';
  const partsMinutes = inputs.minutes_per_session - frame.warmup_min - frame.cooldown_min;
  const raceList = candidates.raceSessions.size
    ? `\n<race_sessions>\nid | station | name | dose | type | pillar | load\n${formatRaceSessions(candidates)}\n</race_sessions>\n`
    : '';
  return `Write weeks ${startWeek} to ${endWeek} of this athlete's program in detail, following the season outline.

<athlete>
${athleteFacts(athlete, inputs, coach, candidates.race)}
</athlete>

<race_format>
${raceFacts(candidates.race)}
</race_format>

<season_outline>
${JSON.stringify(outline)}
</season_outline>
${previous}${adjustment}
<targets>
${weeks.map((w) => {
    const needs = weeklyNeeds(inputs.running.mode, w.core_sessions);
    return `Week ${w.week}: ${w.phase}, ${w.load} load${w.deload ? ', deload' : ''}; lever ${w.lever}; exactly ${w.core_sessions} core sessions, up to ${w.optional_sessions} optional; key session on ${inputs.key_session_day}: ${w.key_session}; focus: ${w.focus}${needs.length && w.week !== outline.weeks.length ? `; core sessions must include (each in a different session): ${needs.join(', ')}` : ''}`;
  }).join('\n')}
Every session: ${frame.warmup_min} min warm-up + parts totalling ${partsMinutes} min + ${frame.cooldown_min} min cool-down = ${inputs.minutes_per_session} min (deload weeks may be shorter).
Sessions only on ${inputs.training_days.join(', ')}; one core session per day.
</targets>

<formats>
Use only these formats for this athlete: ${[...args.availableFormats].join(', ')}.
${formatFormats(candidates, args.availableFormats)}
Tabata part lengths for this athlete: ${tabataTimings.map((t) => `${t.blocks} block(s) = ${t.minutes} min`).join('; ')}
${args.plyoContacts ? `Plyometric foot contacts for this athlete: ${args.plyoContacts[0]}–${args.plyoContacts[1]} per plyometric part.` : ''}
Race simulations must fit the session length: at ${inputs.minutes_per_session} min, plan a partial simulation (some stations with their runs), never a full race.${candidates.race.run_distance_m ? ` Every run segment in a race simulation is exactly ${candidates.race.run_distance_m} m: set run_distance_m to ${candidates.race.run_distance_m}.` : ''}
Running exercises for this athlete (use these ids for any run): ${args.runExerciseIds.join(', ') || 'none'}.
</formats>

Rules for sessions:
- Use only the exercises, templates and race sessions listed below, by their exact id. Never invent an exercise or rename one.
- Strength, Circuit and Mobility parts use a template: set template_id, set minutes to the template's part length, and give exactly one item per slot, in slot order, whose movement pattern fits the slot (and body region, where the slot names one). Other formats have template_id null.
- Each item sets exactly one of exercise_id or race_session_id; the other is null. Set block only for Tabata items, foot_contacts only for plyometric drills, run_minutes only for running in compromised parts, and run_distance_m only for run segments in race simulations${candidates.race.run_distance_m ? ` (${candidates.race.run_distance_m} m)` : ''}. Leave the others null.
- Running exercises are marked R; they only go in ${inputs.running.mode === 'programmed' ? 'Run, ' : ''}RaceSim and Compromised parts.${inputs.running.mode === 'programmed' ? ' Run parts set run_type (key, easy, long or recovery).' : ''}
- Leave out fields that don't apply (cue, block, foot_contacts, run_minutes, run_distance_m, template_id, run_type, slot) instead of sending them empty.
- Optional sessions have optional true and a short slot key that stays the same across these weeks (for example "extra-intervals"), so the athlete's completions can be counted. Core sessions have optional false and slot null.
- Mark exactly one core session a week as the key session, on ${inputs.key_session_day}.
- Give each week's progression: the lever from the outline and, in one sentence, what changes.

<exercises>
id | name | movement | body region | methods | pillar | flags (T = Tabata-suitable, R = running)
${formatExercises(candidates)}
</exercises>

<templates>
id | format | focus | part length | slots
${formatTemplates(candidates)}
</templates>
${raceList}`;
}

export function repairPrompt(errors: string[]): string {
  return `Your answer broke these rules:
${errors.map((e) => `- ${e}`).join('\n')}

Return the complete corrected answer, following all the original rules.`;
}
