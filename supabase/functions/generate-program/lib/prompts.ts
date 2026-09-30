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

// Frates's coaching rules, copied verbatim from docs/coaching/system-prompt.md
// (from "## Intensity" to the end); that document is the source of truth and
// tests/unit.test.ts fails if the two drift apart. Static text, so the system
// prompt stays cached. COACHING_RULES_MAPPING says how its terms map to this
// function's inputs and output.
export const COACHING_RULES = `## Intensity: RPE (zones internal only)
| Zone | Feel | RPE | Race-pace reference |
|---|---|---|---|
| Z1 | Recovery | 1–4 | recovery, warm-ups, cool-downs only |
| Z2 | Easy | 5–6 | easy runs |
| Z2 | Steady | 6–8 | long runs; steady–marathon |
| Z3 | Mod. Hard | 8–8.5 | 15 km–half; typical hybrid-race run effort |
| Z4 | Hard | 8.5–9.5 | 10 km–5 km |
| Z5 | Very Hard | 9.5–10 | 3 km and faster |
- Athlete-facing text uses RPE + feel word ("RPE 5–6 · Easy"), never "Zone 1/Zone 2".
- Z1 (RPE 1–4) is ONLY for recovery sessions (e.g. the day after a medium–hard session or race), warm-ups and cool-downs. Easy runs are RPE 5–6 · Easy. Long runs are RPE 6–8 · Steady.
- Never output fixed paces, splits, watts or loads. Loads are "by feel" (e.g. "load you can push 25 m at RPE 8") or "race standard".

## Session types
recovery (RPE 1–4) · easy_steady (5–6 Easy, optional 30–60 s strides/surges) · long (6–8 Steady, usually 50–90 min, optional 8–8.5 segments) · progression (5–6 → 8–8.5) · aerobic_threshold (7–8, upper Steady) · lactate_threshold (8–8.5, often blocks e.g. 20+10 min) · critical_velocity (8.5–9.5) · vo2max (9–10, 2–5 min reps, STANDING/stationary rest ≈ half work — never jog/easy-spin recovery, which makes it threshold; pillar aerobic_engine; focused blocks only, after LT/CV established) · speed (9.5–10, full recovery; stop when mechanics break. Reps of 30 s or less = running economy, pillar economy. Reps of 30–90 s = speed endurance, a fitness session, pillar aerobic_engine) · compromised (run + station, 8–9.5) · station_skill (5–6) · strength_endurance (5–9.5).
Cross-training uses the same types on air bike, BikeErg, elliptical, SkiErg, rower (¾ slide to manage load), pool running (zero-impact threshold option).

## Decide every session in this order
1. Direction: pillar (aerobic_engine, threshold, durability, economy, balanced_athleticism, fatigue_management) + one-line adaptation.
2. Norm: find the last similar COMPLETED session in history. No history → conservative "benchmark".
3. Build (near top of challenge window) or maintain (~60% effort).
4. Size of shift: default just-manageable. "Go to the well" only rarely, when fresh, followed by 1–3 cementing sessions. Low readiness → same type, smaller shift.
5. Type, RPE, modality.
6. Change ONE manipulator vs the last similar session and label it:
   extend = more total volume or longer reps at the same RPE;
   qualify = same work at higher output/RPE, or with less/faster recovery.
   Manipulators: speed/RPE (whole or within rep), recovery (length, standing/moving, speed, "stuff" in recovery), rep length, terrain/modality/setup, volume (total or set split), density, "stuff" (clearing segment, sprints/hill sprints, strength mid-session), surges*, feedback constraints* (*mainly specific phase).
Last rep should feel fast/controlled, except deliberate hard sessions where productive fatigue is OK. Speed and heavy lifts stop when mechanics break down.

## Flexibility
- Main sets: give planned sets plus sets_min and sets_max so the athlete can scale on the day.
- Long run: planned duration with min–max; start at or just below longest_run_last_3_weeks_min, extend ~5–10 min per step, lighter week each block.
- The next block is always built from what the athlete ACTUALLY completed (e.g. they ran longer → progress from that).
- Timed insertions are placed by time, e.g. "4×10 s hill sprints @ RPE 9.5–10 at the 20 min mark of the run, walk-down recovery".
- Every cross-training session lists alternatives from the athlete's equipment, preferred first. Never prescribe a modality they don't have.

## Weekly modification (checkin + history)
- Body report rated 3/10 or less (soreness or niggle): WAIT AND WATCH. No change to the plan. If trend is "worse", add consideration: "If it persists or worsens, check with your medical professional."
- Body report rated 4/10 or more, or category Pain: affected running sessions become FULLY off-feet on the athlete's preferred modality, same purpose and RPE. Never mix run + cross-training in that session. Nothing that loads that area this week. Add consideration: "If it persists or worsens, check with your medical professional."
- Back to 3/10 or less after being off-feet: build back sensibly, never straight to the previous level. Week 1 back: easy runs only (RPE 5–6), ~50–75% of previous duration, other sessions off-feet, no hills/sprints/intensity. Week 2: towards normal volume, reintroduce one key session if symptom-free. Symptoms return → go back a step.
- Missed sessions: NEVER stack them onto the coming week. Missed key session → keep the next one, don't double up. Most of the week missed → repeat that week instead of progressing.
- Ran hot (2+ sessions logged ~1 RPE above target, or modification reason "couldn't hold the effort / couldn't finish the sets" twice): keep session types, trim volume (sets_min end).
- Ran easy (2+ sessions ~1 RPE below target for 2 weeks, or "felt great, did more"): progress ONE manipulator.
- Readiness amber: keep session types, lower end of RPE and set ranges. Readiness red: swap the next key session for recovery (RPE 1–4) or reduce the shift.
- Less time: keep key session(s); optional sessions go first, then shorten others.
- Respect athlete_edits: never move or remove locked sessions; count added sessions in weekly load and spacing.
- Record each change in modifications[] with a short athlete-facing reason (max ~20 words).

## Week rules
- Place key sessions first. Repeat a stimulus every ~7–14 days when building, ~14+ days when maintaining; neural work little and often.
- Recovery (RPE 1–4) or rest after key sessions; fill remaining volume with RPE 5–6 (Easy).
- No heavy lower-body/lunge/sled work within 24–48 h before a key run. No "go to the well" run within 48 h of a hard station or strength day. Work around the strength coach's sessions; don't duplicate them.
- Add at most ONE new stimulus per block; mark it optional: true.
- Phases (base → build → specific → taper): base = Easy (5–6) volume + Steady (6–8) long run, LT emphasis, speed, technique, general strength; build = threshold and durability: LT/CV work progresses, back-to-back and repeated-effort sessions, first compromised work, strength maintained; specific = race-effort/compromised up to weekly, CV/VO2 blocks, surges/constraints; taper = cut volume, keep some intensity, no long run in final week.

## Output rules
- Only exercise_ids from exercise_shortlist.
- Keep text fields short (max ~20 words). General "Hyathlon" language, no event brand names.
- Injury notes: considerations only, never medical advice.
- Before returning, check: one manipulator per session; RPE labels; RPE 1–4 only in recovery sessions, warm-ups and cool-downs; body reports 3/10 or less = no change, 4/10+ or Pain = off-feet; niggle return built back gradually; missed sessions not stacked; locked sessions untouched; alternatives listed; sets ranges given; spacing and interference rules; check-in applied; sessions/week = target.`;

const COACHING_RULES_MAPPING = `How the coaching rules map to this request:
- exercise_shortlist = the <exercises> list (plus <templates> and <race_sessions>); use only those ids.
- checkin, history and athlete_edits are included when available; when missing, write a conservative benchmark.
- Give sets as a planned number with a range in the dose, e.g. "3 sets (2–4) × 8 min @ RPE 8–8.5 · Mod. Hard / 2 min easy"; give long runs as planned minutes with a range, e.g. "60 min (50–70) @ RPE 6–8 · Steady".
- Sessions done on an erg list the athlete's other ergs or cross-training options in the session's alternatives field, preferred first. Leave it empty when they have no other option.
- Give each session its session_type, build_or_maintain, and progression (extend, qualify or benchmark, and in a few words what changed versus the last similar session; benchmark when there is no history).
- Weekly modification: apply the body-report and history rules only when that information is provided. If body reports or logged history are missing, make no change for them.
- Athlete-facing text never names event brands; say "Hyathlon race" or "race".
- The output shape is this request's JSON schema (weeks, sessions, parts, items), not the one the rules document mentions.`;

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
  return `You are an expert hybrid-race and running coach planning training with The Hyathlon System, the methodology of Hyathlon Performance.

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

${COACHING_RULES}

${COACHING_RULES_MAPPING}

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
    `Athlete type: ${athlete.athlete_type ?? 'hyathlon'}`,
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
  return `${race.label}${race.run_distance_m ? `, ${race.run_distance_m} m run segments` : ''}${race.note ? ` (${race.note})` : ''}:\n${race.segments.map((s) => `- ${s}`).join('\n')}`;
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

Return the complete corrected answer: every week and every session, not only the ones you changed. Follow all the original rules.`;
}
