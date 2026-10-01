import type { AthleteRow } from './auth.ts';
import { type Candidates, formatCompromised, formatExercises, formatFormats, formatRaceSessions, formatTemplates, type RaceOption } from './candidates.ts';
import { coreSessionsForStrength, raceWeekStrengthDays, taperWeeks, type Timing, weeklyNeeds } from './validate.ts';
import { weekdayOf } from './time.ts';
import { homeOffFeet, intervalIntroWeek, RUNNING_LEVEL_LABEL, runningLevel } from './running.ts';
import { longRunEffort, longRunPlan } from './longruns.ts';
import type {
  BlockWeek, CanDouble, EventType, Limiter, Outline, OutlineWeek, OwnStrengthSession, RunningMode, StrengthChoice, StrengthPlacement, TrainingAge,
  VarietyPreference,
} from './schemas.ts';

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
  can_double?: CanDouble; // onboarding 10b: can train twice in a day
  strength_placement?: StrengthPlacement; // onboarding 10c
  limiters?: Limiter[]; // onboarding 3b, up to 2
  strength_sessions_pref?: number; // onboarding 10d, 2–6
  strength_choice?: StrengthChoice; // onboarding 10a (default program)
  own_strength?: OwnStrengthSession[]; // strength_choice 'own'
  training_age?: TrainingAge | null; // onboarding 3
  interval_experience?: 'yes' | 'no' | null; // onboarding 4b
  can_run_20_min?: 'yes' | 'no' | null; // onboarding Q5 follow-up when the longest run is "not sure"
  off_feet_includes?: ('simulations' | 'erg' | 'bike')[] | null; // onboarding Q2c (no running)
  hyathlon_races_count?: '0' | '1_2' | '3_5' | '6_plus' | null; // onboarding Q1d
  repeat_preference?: 'same_two_weeks' | 'alternate' | 'always_new' | null; // onboarding 14b
  runs_per_week?: number | null; // onboarding 4 (5 = 5+)
  recent_result?: { event: string; time: string; date: string | null; avg_run_pace: string | null } | null; // onboarding 6
  variety_preference?: VarietyPreference | null; // onboarding 14
  dislikes?: string | null; // onboarding 15
  preferred_long_run_day?: string | null; // onboarding 2b
  last_race?: { type: EventType; date: string } | null; // onboarding 1c, only if in the last 4 weeks
  other_events?: { name: string; type: EventType; date: string; event_priority: 'A' | 'B' | 'C' }[]; // onboarding 1b / §12; the goal event is A
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
| Z2 | Steady | 6–8 | steady aerobic; steady–marathon |
| Z3 | Mod. Hard | 8–8.5 | 15 km–half; typical hybrid-race run effort |
| Z4 | Hard | 8.5–9.5 | 10 km–5 km |
| Z5 | Very Hard | 9.5–10 | 3 km and faster |
- Athlete-facing text uses RPE + feel word ("RPE 5–6 · Easy"), never "Zone 1/Zone 2".
- Z1 (RPE 1–4) is ONLY for recovery sessions (e.g. the day after a medium–hard session or race), warm-ups and cool-downs. Easy runs are RPE 5–6 · Easy. Long runs are RPE 5–6 · Easy for beginner–intermediate runners and RPE 6–7 for advanced.
- Never output fixed paces, splits, watts or loads. Loads are "by feel" (e.g. "load you can push 25 m at RPE 8") or "race standard".

## Session types
recovery (RPE 1–4) · easy_steady (5–6 Easy, optional 30–60 s strides/surges) · long (RPE 5–6; 6–7 advanced; usually 60–90 min, advanced up to 90–120 min max, optional 8–8.5 race-effort segments) · medium-long (easy, RPE 5–6; 12–15 km for most, about 60–70% of the long run) · progression (5–6 → 8–8.5) · aerobic_threshold (7–8, upper Steady) · lactate_threshold (8–8.5, often blocks e.g. 20+10 min) · critical_velocity (8.5–9.5) · vo2max (9–10, 2–5 min reps, STANDING/stationary rest ≈ half work — never jog/easy-spin recovery, which makes it threshold; pillar aerobic_engine; focused blocks only, after LT/CV established) · speed (9.5–10, full recovery; stop when mechanics break. Reps of 30 s or less = running economy, pillar economy. Reps of 30–90 s = speed endurance, a fitness session, pillar aerobic_engine) · compromised (run + station, 8–9.5) · station_skill (5–6) · strength_endurance (5–9.5).
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
- Core principle: the app recommends, the athlete decides. Athlete choices and edits override these rules. Never undo or "correct" them; plan the rest of the week around them and, where they cost recovery, add a one-line note in the session's execution_note or considerations.
- Record each change in modifications[] with a short athlete-facing reason (max ~20 words).

## Week rules
- Place key sessions first. Repeat a stimulus every ~7–14 days when building, ~14+ days when maintaining; neural work little and often.
- Quality sessions: running programs → the interval sessions and the long run; the key session is the main interval session (RPE 8+). Strength-only / no-running programs → key can be a hard strength session (may stand alone on its day), an off-feet interval session at RPE 8+ (erg, bike or bodyweight), a Hyathlon race simulation, or a hard AMRAP/EMOM-type workout. Include race simulations / erg / bike sessions only as chosen in athlete.off_feet_includes; in simulations, replace run segments with the athlete's preferred erg or bike.
- Never quality or key: station_skill (technique work: warm-up, strength day or short add-on), easy, recovery, and core/mobility — except in a taper or post-event week, when core/mobility can be the week's main session.
- Station skill is never a day's only main session (it is warm-up, strength-day or short add-on work).
- Home beginner, no running, no ergs/bike — weekly shape:
  - Key session: bodyweight intervals or an AMRAP/EMOM at RPE 8+ (e.g. 6–10 × 40 s hard / 20–40 s easy using exercises from their library, or a 12–16 min AMRAP). Never an easy technique circuit.
  - Strength: 2 sessions (their choice), hard with intent. One goes straight after the key session in the same visit (allowed when can_double is "no" — it's still its own session, the same rule as strength straight after a run). The other can stand alone on its own day.
  - Station skill: only as a short add-on (≤10 min) inside a strength day, never a day's only session.
  - Other days: rest, or an easy brisk walk (RPE 5–6) and mobility. No circuits on easy days.
  - Deload/taper: same strength rules as everyone (deload 1 + 1 optional; taper 1 at maintain; race week 1 short maintain ≥5 days out); key session shortened, same intensity.
  - Core sessions are exactly the key session + their strength sessions (deload: key + 1 strength, with the optional strength session on top).
  - Progress by intensity or volume only — never the frequency lever for this profile.
  - Any extra session is an optional easy walk + mobility.
- Taper: Hyathlon races 8–14 days (race week + the week before): volume down 40–60% (e.g. threshold 8 × 4 min → 4 × 4 min; long run 75 → 35 min), keep intensity and frequency; strength tapers for power (same load, fewer sets and reps, done fast). Marathon / half marathon goals: ~3 weeks, ~80% → ~60% → ~30%.
- Race week (running programs): key session = short sharpener at least 4–5 days before the race: 10–15 min easy warm-up, 15 min just slower than race effort (~10–20 s/km slower than the athlete's race average run pace if stored, otherwise RPE 8), 10–15 min easy cool-down. Other runs easy.
- Advanced / high-volume running (up to ~70–100 km/week): Mon aerobic, Tue quality AM + second session PM, Wed medium-long run (easy, 12–15 km for most), Thu quality AM + second session PM, Fri aerobic or recovery, Sat recovery, Sun long run (most 60–90 min; advanced up to 90–120 min max). Strength gets the PM slot on quality days first; easy doubles only where there's no strength that day, only if can_double allows and the athlete wants them. Build weeks steady. Taper as for the race (Hyathlon 8–14 days; marathon ~3 weeks).
- Beginners get a real quality session at a smaller dose (e.g. 4–6 × 3 min at RPE 8 with 2 min easy, or a short compromised session with long rests), never an easy circuit.
- Beginners: strength sits as the second session on quality days (or straight after the run if can_double is no), leaving other training days for runs or conditioning.
- "Change ONE manipulator" applies to quality sessions (intervals, long run, key strength, race simulations). Easy, recovery, optional and maintain sessions may repeat unchanged.
- Repeats: a quality session may repeat unchanged 2–3 times while the athlete's response improves; follow athlete.repeat_preference (same_two_weeks: the same session two weeks in a row, then progress | alternate: A / B / A / B, each progressing on its repeat | always_new: change one lever every session).
- Full Hyathlon race simulations at most every 3–4 weeks (specific phase); compromised work otherwise in small doses inside quality days.
- After a race: no intensity in the first 48–72 h; the first quality session (day 4–7 after one Hyathlon race; ~10 days after 2+ races in one event) starts with a test-the-system warm-up note: if it doesn't feel normal, make it easy aerobic.
- Motivation low (athlete.motivation ≤4 or dropping 2+ below their average): easy sessions use compliance formats (aerobic intervals 40–70 s @ RPE 6–7 / 20–40 s RPE 1–4; 15–20 s @ RPE 8–8.5 / 40–70 s easy; surges 5–10 s @ RPE 9 / 40–60 s easy; pick-ups 40–50 s @ RPE 8 every 5–6 min) — still easy overall.
- Long-run efforts only for well-conditioned athletes, never beginners.
- Starting running level (athlete.running_level, from the longest recent run): Beginner 1 (0 min) → walk–run; Beginner 2 (under 20 min) → aerobic runs with walk breaks, and a race goal starts with a ~4-week bridge to 20 min continuous; 20+ min → normal programming.
- Running beginners (Beginner 1–2): 3 runs a week (main, absorption, long) + 1 cross-training; never 3 training days in a row; the absorption run or cross-training goes the day after the long run.
- 30 s efforts inside an aerobic run come before the first interval session.
- interval_experience = yes → week 1 aerobic runs with 30 s efforts; week 2 adds ONE quality interval session.
- interval_experience = no → week 1 aerobic runs only; week 2 aerobic with 30 s efforts; week 3 adds ONE quality interval session.
- Walk–run beginners build to continuous running first, then this sequence starts.
- Recovery (RPE 1–4) or rest after key sessions; fill remaining volume with RPE 5–6 (Easy).
- No heavy lower-body/lunge/sled work within 24–48 h before a key run. No "go to the well" run within 48 h of a hard station or strength day. Work around the strength coach's sessions; don't duplicate them.
- Add at most ONE new stimulus per block, except for experienced athletes (3+ years consistent training, no current injury), who can take more than one; mark new additions optional: true.
- Athlete's own strength/classes (strength_choice = own): fixed sessions; count in load (hard unless marked easy); place runs around them with the interference rule; don't program other strength.
- Race recovery before quality run sessions return: marathon or longer → 3 weeks (easy running and off-feet only); half marathon or Hyathlon race → 1 week; 10 km or shorter → straight back into normal sessions. Race priority: A race → build the periodisation outline backwards from it; full taper and full recovery. B race → checkpoint in the build/specific phase; short taper (3–5 days lighter, volume down ~20–30%, keep one short sharpener, no long run that week); recovery by event type. C race → train through it: at most an easy or lighter day before; it replaces that day's key or long session and counts in load; recovery by event type if raced hard, otherwise one easy day. If a B or C race falls in the last ~10–14 days before an A Hyathlon race (or inside a marathon taper), add a note suggesting a controlled effort; never remove it.
- Travel weeks: only the equipment the athlete says they'll have; no equipment → bodyweight maintenance.
- CrossFit-style WODs are hard sessions: same consolidation rule as strength.
- Phases (base → build → specific → taper): base = Easy (5–6) volume + long run (5–6; 6–7 advanced), LT emphasis, speed, technique, general strength; build = threshold and durability: LT/CV work progresses, back-to-back and repeated-effort sessions, first compromised work, strength maintained; specific = race-effort/compromised up to weekly, CV/VO2 blocks, surges/constraints; taper = cut volume (Hyathlon: 8–14 days, down 40–60%; marathon/half: ~3 weeks, ~80% → ~60% → ~30%), keep intensity and frequency, no long run in final week.

## Strength work
- Hierarchy: aerobic = frequency → volume → intensity; strength = INTENSITY → volume → frequency. A set too easy to create adaptation is not made productive by repeating it.
- Strength sessions/week = athlete.strength_sessions_pref (default 2; 3 if strength endurance is a limiter). Honour a higher choice (4+, e.g. upper/lower/core split): place extras on hard days first, then own days, then easy days (upper body/core first) with a short recovery-cost note. Never place strength on a recovery day yourself. A Hyathlon race simulation is a hard hybrid session, not a strength session. 2–3 WORKING sets per exercise, shown as "Hard, with intent: finish with 1–2 good reps left" (no RPE number for strength sets), 6–10 reps, max 3–4 exercise groups per session. Low volume, high effort — cut junk volume, not intent.
- Count and show working sets only. Warm-ups are "ramp-up sets as needed" and never counted in sets or sets_min/sets_max.
- Never add light strength sessions to add frequency ("inflammation without adaptation").
- Placement follows athlete.strength_placement:
  - "with_hard_sessions" (default): strength is its OWN session on a quality running (or hard conditioning) day — run first, strength later that day (a double day). If athlete.can_double is "no", place the strength session straight after the run on the same day, still as a separate session.
  - "own_days": a strength day is a hard day — not the day after a key session, followed by an easy or recovery day.
  - Either way: NEVER strength, circuits or accessories on recovery (RPE 1–4) or easy (RPE 5–6) days. Strides on easy runs are fine.
- Strength-endurance circuits and station work are hard sessions too: same consolidation rule.
- Progress ONE lever per strength session vs the last similar one: load, reps, execution, density, pause length, slower tempo or force. Repeating what they could already do is not training.
- Tempo/pause lever: up to 4 s up, a pause (1–3 s) and 4 s down; progress one part at a time (e.g. lowering 2 → 3 → 4 s, then add a pause, then slow the way up); never add load in the same session as a tempo change. Write it for athletes as e.g. "4 s down · 2 s pause · 4 s up".
- Strength progression stays WITHIN 2–3 working sets and 6–10 reps: a volume or intensity week means more load, slower tempo, longer pauses or better execution. Never progress by adding a 4th set or going past 10 reps (unless the athlete chose that).
- Strength types (general, general strength/hypertrophy, maximal, explosive/power, reactive, isometric, strength endurance) are tagged in the exercise library. Their own doses aren't confirmed yet: all strength uses 2–3 working sets × 6–10 reps for now.
- Maintain strength = same load and intent, fewer working sets (1–2). Never maintain with light loads.
- Deload weeks: 1 strength session plus 1 OPTIONAL strength session (optional: true), both with fewer working sets at the same load and intent.
- Taper: 1 strength session/week at maintain. Race week: 1 short maintain session early in the week, at least 5 days before the race.
- A strength session that is the second session of the day is 30–45 min (use the 30/45-min templates), not the athlete's usual minutes per session.
- Low readiness: fewer working sets or exercises, same intent. If it can't be done with intent, move it rather than doing it easy.
- Interference: no heavy lower-body/lunge/sled within 24–48 h before a key run or the long run — never the day before, and never a second (PM) session two days before. If a strength session must sit there, make it upper body + core.
- Goal: stimulate, recover, adapt. Get the adaptation and protect the week.

## Output rules
- Only exercise_ids from exercise_shortlist.
- Keep text fields short (max ~20 words). General "Hyathlon" language, no event brand names.
- Session titles name only exercises and equipment actually in the session.
- Injury notes: considerations only, never medical advice.
- Before returning, check: one manipulator per session; RPE labels; RPE 1–4 only in recovery sessions, warm-ups and cool-downs; body reports 3/10 or less = no change, 4/10+ or Pain = off-feet; niggle return built back gradually; missed sessions not stacked; locked sessions untouched; alternatives listed; sets ranges given; spacing and interference rules; check-in applied; sessions/week = target; strength = 2/week default, working sets only, one lever progressed, placed per strength_placement.`;

const COACHING_RULES_MAPPING = `How the coaching rules map to this request:
- exercise_shortlist = the <exercises> list (plus <templates> and <race_sessions>); use only those ids.
- checkin, history and athlete_edits are included when available; when missing, write a conservative benchmark.
- Give conditioning sets as a planned number with a range in the dose, e.g. "3 sets (2–4) × 8 min @ RPE 8–8.5 · Mod. Hard / 2 min easy"; give long runs as planned minutes with a range, e.g. "60 min (50–70) @ RPE 5–6 · Easy" (RPE 6–7 for advanced runners).
- Sessions done on an erg list the athlete's other ergs or cross-training options in the session's alternatives field, preferred first. Leave it empty when they have no other option.
- Give each session its session_type, build_or_maintain, and progression (extend, qualify or benchmark, and in a few words what changed versus the last similar session; benchmark when there is no history).
- athlete.can_double and athlete.strength_placement are in <athlete>. A double day has two separate sessions on the same day: order_in_day 1 (first, e.g. AM quality run) and 2 (second, e.g. PM strength). Strength is always its own session, never a part inside a run session. can_double "no" still means strength goes straight after the day's run or hard session as its own session (order_in_day 2): that is the expected placement, not a second training session. "sometimes": use double days sparingly. "yes": running doubles are allowed too.
- Strength dose: working sets × reps and the intent, no RPE number, e.g. "3 sets (2–3) × 6–8, hard with intent: finish with 1–2 good reps left". Never more than 3 working sets (the set range too) and never outside 6–10 reps. Progress strength by load, reps within 6–10, execution, tempo, pauses or density, never by adding a 4th set or going past 10 reps. Ramp-up sets are not written or counted. Maintain = 1–2 working sets. A strength template's slots pair into supersets (A1/A2); a strength session has at most 4 exercise groups.
- Weekly modification: apply the body-report and history rules only when that information is provided. If body reports or logged history are missing, make no change for them.
- execution_note and considerations both go in the session's note field: one short athlete-facing line, left out when there is nothing to say.
- Athlete-facing text never names event brands; say "Hyathlon race" or "race".
- The output shape is this request's JSON schema (weeks, sessions, parts, items), not the one the rules document mentions.`;

export interface CoachProfile {
  strengths: string[];
  weaknesses: string[];
  priority_pillars: string[];
  limiters: string | null;
  coach_notes: string | null;
  compromised_level?: 'entry' | 'standard' | 'auto'; // coach override for the compromised sessions
}

// The athlete's running choice (in <athlete>) decides where running goes.
// Takes priority over the reference material's running programs.
const RUNNING_RULES = `Running (follow the athlete's running choice in the athlete facts; this takes priority over the reference material):
- "Program my running": plan their running with Run parts (run_type key, easy, long or recovery), using the session design rules above for types, RPE, ranges and long-run progression. Every week needs running suited to the phase: a key run, plus an easy or long run where days allow. Start the long run at or just below their longest run in the last 3 weeks, then extend it by at most 10 minutes at a time. A long run may make its session longer than the usual minutes (up to 120 min).
- "I already have a run plan": don't plan any runs (no Run parts); they run on their own days. Plan around them: no heavy lower-body strength or sled work the day before a hard run (and preferably not two days before). Count their runs in the week's load.
- "No running": no Run parts. Apply the session types, RPE scale and progression rules to ergs and other cross-training instead (air bike, BikeErg, SkiErg, rower), and to sleds, circuits and the other formats.
- "Program my running" and "I already have a run plan": running also appears as run segments in race simulations (at the race's run distance), short run segments in compromised parts (at most 25% of that part's time) and compromised runs (CompromisedRun, from the compromised sessions listed).
- "No running" is off-feet only: no running anywhere. Race simulations and compromised runs only if the athlete chose simulations (off_feet_includes), with every run segment replaced by their preferred erg or bike; erg (SkiErg / row) and bike sessions only if chosen.
- The niggle rules apply to erg and station work in the same way: swap to a pain-free off-feet or upper-body option with the same purpose and RPE.`;

const FORMAT_RULES = `Session structure:
- A session is a warm-up, then 1 to 3 parts, then a cool-down. The warm-up and cool-down are added for you; give only the parts. The parts' minutes plus warm-up and cool-down must equal the athlete's minutes per session (within 5 minutes).
- Each part has one format. Timed formats (Circuit, Tabata, HIIT, Mobility, Aerobic) are dosed by time and RPE only, never reps. Rep formats (AMRAP, EMOM, ForTime, Station, RaceSim, Compromised) give reps or distance. Strength gives working sets × reps and the intent, no RPE number (e.g. "3 sets (2–3) × 6–8, hard with intent: finish with 1–2 good reps left"). Plyometrics give foot contacts.
- Timing (work, rest, rounds, blocks) comes from the database; don't restate it in the dose.
- Weekly mix (core sessions, each need in a different session): with running programmed, 3 sessions = a key run and a hybrid/station session; 4 or more = a key run, an easy or long run and a hybrid/station session. Otherwise, 2 or more sessions = at least one conditioning/station session. On top of these come the week's strength sessions (the outline's strength_sessions). Race week is exempt from the mix.
- Plyometrics go first, straight after the warm-up, with full recovery.
- Tabata is classic only: 20 s maximal work / 10 s complete rest × 8 rounds per 4-minute block, 1 exercise or 2 alternating, Tabata-suitable exercises only (marked T). For beginners, cue it "hard but controlled".
- Give a short technique cue (in cue) for race-station exercises and for exercises that target the athlete's weaknesses.

Progression (frequency, intensity, volume — one lever per week):
- Frequency: sessions per week (a new session is added as optional first).
- Intensity: load, RPE, a harder variation, or a tougher work:rest ratio.
- Volume: more exercises, sets, rounds, time cap or foot contacts.
- Every week progresses the quality sessions (intervals, long run, key strength, race simulations) by one lever; easy, recovery, optional and maintain sessions may repeat unchanged. Deload weeks are about 60–70% of the previous week.`;

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

const TRAINING_AGE_LABEL: Record<string, string> = {
  under_6_months: 'less than 6 months', '6_12_months': '6–12 months', '1_3_years': '1–3 years', '3_plus_years': '3+ years (experienced)',
};
const VARIETY_LABEL: Record<string, string> = { same: 'mostly the same sessions', balance: 'a balance', variety: 'lots of variety' };
const EVENT_LABEL: Record<EventType, string> = {
  hyathlon: 'Hyathlon race', marathon_or_longer: 'marathon or longer', half_marathon: 'half marathon', '10k_or_shorter': '10 km or shorter', other: 'other event',
};

const PRIORITY_LABEL: Record<'A' | 'B' | 'C', string> = {
  A: 'major target: full preparation, peak and taper',
  B: 'important race / checkpoint: short taper',
  C: 'training race: train through it',
};

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
    `Training days: ${inputs.training_days.join(', ')} (${inputs.training_days.length} days; sessions only on these days, up to 2 a day)`,
    `can_double: ${inputs.can_double ?? 'no'}`,
    `strength_placement: ${inputs.strength_placement ?? 'with_hard_sessions'}`,
    `strength_choice: ${inputs.strength_choice ?? 'program'}`,
    ...(inputs.strength_choice === 'own'
      ? [`Their own strength/classes (fixed; count in load): ${(inputs.own_strength ?? []).map((o) => `${o.title} on ${o.days.join('/')} (${o.intensity})${o.details ? `: ${o.details}` : ''}`).join('; ') || 'not given'}`]
      : [`strength_sessions_pref: ${inputs.strength_sessions_pref ?? 2}`]),
    `Training age: ${TRAINING_AGE_LABEL[inputs.training_age ?? ''] ?? 'not specified'}`,
    ...(inputs.running.mode === 'programmed'
      ? [
        `running_level: ${RUNNING_LEVEL_LABEL[runningLevel(inputs)!]}`,
        `interval_experience: ${inputs.interval_experience ?? 'not specified (treat as no)'}`,
        `Long-run effort: ${longRunEffort(athlete.level === 'advanced')}; long runs up to ${athlete.level === 'advanced' ? 120 : 90} min`,
        `First quality interval session: ${intervalIntroWeek(inputs) ? `program week ${intervalIntroWeek(inputs)} (30 s efforts inside aerobic runs come first; before then the key session is the week's main aerobic run)` : 'not yet: walk–run builds to continuous running first'}`,
      ]
      : []),
    ...(homeOffFeet(inputs, athlete.level)
      ? ['Weekly shape: home beginner, no running, no ergs/bike (see the week rules): key bodyweight intervals or AMRAP/EMOM at RPE 8+; one strength session straight after it, the other on its own day; station skill only as a ≤10 min add-on on a strength day; other days rest or an easy brisk walk (Brisk walk, EX0497) and mobility.']
      : []),
    ...(inputs.running.mode === 'none'
      ? [`off_feet_includes: ${inputs.off_feet_includes ? inputs.off_feet_includes.join(', ') || 'none of simulations, erg or bike (strength, bodyweight and workouts only)' : 'not asked'}`]
      : []),
    `Hyathlon races done: ${({ '0': '0', '1_2': '1–2', '3_5': '3–5', '6_plus': '6+' } as Record<string, string>)[inputs.hyathlon_races_count ?? ''] ?? 'not specified'}`,
    `Runs per week now: ${inputs.runs_per_week == null ? 'not specified' : inputs.runs_per_week >= 5 ? '5+' : inputs.runs_per_week}`,
    `Recent race or time trial: ${inputs.recent_result ? `${inputs.recent_result.event} in ${inputs.recent_result.time}${inputs.recent_result.date ? ` (${inputs.recent_result.date})` : ''}${inputs.recent_result.avg_run_pace ? `, average run pace ${inputs.recent_result.avg_run_pace}` : ''}` : 'none given'}`,
    `repeat_preference: ${inputs.repeat_preference ?? 'always_new'}`,
    `Variety: ${VARIETY_LABEL[inputs.variety_preference ?? ''] ?? 'not specified'}`,
    `Dislikes or won't do: ${inputs.dislikes || 'none given'}`,
    ...(inputs.preferred_long_run_day ? [`Preferred long-run day: ${inputs.preferred_long_run_day}`] : []),
    `Last race (in the last 4 weeks): ${inputs.last_race ? `${EVENT_LABEL[inputs.last_race.type]} on ${inputs.last_race.date}` : 'none'}`,
    `Other events: ${inputs.other_events?.length ? inputs.other_events.map((e) => `${e.name} (${EVENT_LABEL[e.type]}) on ${e.date}, priority ${e.event_priority} (${PRIORITY_LABEL[e.event_priority]})`).join('; ') : 'none'}`,
    `limiters (the athlete's answer): ${inputs.limiters?.length ? inputs.limiters.join(', ') : 'not specified'}`,
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
- Group the weeks into phases (base, build, specific, taper) that cover every week in order. Shorter programs can skip base or build. The taper is the final ${taperWeeks(window.totalWeeks)} weeks: race week and the week before (Hyathlon races taper 8–14 days).
- For each week give the focus, the load (Low, Moderate or High), whether it is a deload, the one progression lever (week 1 "start", deload and taper weeks including race week "deload", otherwise ${homeOffFeet(inputs, athlete.level) ? 'intensity or volume (never frequency for this athlete)' : 'frequency, intensity or volume'}), the number of core sessions, the number of optional sessions (0 to 2), the key session (on ${inputs.key_session_day}), 2 to 4 key sessions in a few words each, and the pillars it trains.
- Core sessions per week are never more than ${days * 2} (the athlete trains ${days} days, up to 2 sessions a day; see can_double). Optional sessions go on the same days.
${(inputs.strength_choice ?? 'program') !== 'program' ? `- strength_sessions is 0 every week: the athlete ${inputs.strength_choice === 'own' ? 'does their own strength or classes (fixed sessions that count in load; plan around them)' : 'wants no strength sessions'}.` : `- strength_sessions per week (counted inside core_sessions): the athlete chose ${inputs.strength_sessions_pref ?? 2}, usually as the second session on hard days. ${homeOffFeet(inputs, athlete.level) ? 'For this athlete core_sessions is exactly 1 (the key session) + strength_sessions, every week; any extra session is an optional easy walk + mobility. ' : ''}Normal weeks (not deload, taper or race week): core_sessions at least ${coreSessionsForStrength(inputs.running.mode, days, inputs.strength_sessions_pref ?? 2, athlete.level === 'beginner', homeOffFeet(inputs, athlete.level))} (${homeOffFeet(inputs, athlete.level) ? 'the key session' : athlete.level === 'beginner' ? `a run or conditioning session on each of the ${days} training days` : weeklyNeeds(inputs.running.mode, 99, 0).join(', ') || 'no other needs'}, plus ${inputs.strength_sessions_pref ?? 2} strength), and strength_sessions = the smaller of ${inputs.strength_sessions_pref ?? 2} and core_sessions minus ${weeklyNeeds(inputs.running.mode, 99, 0).length}. Deload weeks: strength_sessions 1, plus 1 optional strength session (count it in optional_sessions), both at maintain. Taper weeks: 1 (maintain). Race week (week ${window.totalWeeks}): ${raceWeekStrengthDays(inputs.race_date ? weekdayOf(inputs.race_date) : null).length ? '1 short maintain session, at least 5 days before the race' : '0 (the race is too early in the week for one at least 5 days before it)'}.`}
- Plan the weekly mix and running for the athlete's running choice (${RUNNING_LABEL[inputs.running.mode]}).
- Build up core sessions gradually; add at most one new stimulus per 4-week block, first as an optional session.
- In the summary, describe core and optional sessions accurately: core sessions are the week's planned sessions; optional ones are extras "if you have time".`;
}

export interface BlockPromptParts {
  shared: string; // the same for every week of a block: cached
  weekly: string; // this call's weeks
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
  raceStrengthDays: string[]; // race-week strength days (at least 5 days before the race)
  targetWeeks?: OutlineWeek[]; // overrides the outline's targets (weekly adjustments)
  previousWeek?: BlockWeek; // the week before, for progression
  referenceWeek?: BlockWeek; // week 1 of this block, when later weeks are written in parallel
  adjustment?: string; // why this week is being rewritten
}): BlockPromptParts {
  const { athlete, inputs, coach, outline, startWeek, endWeek, candidates, frame, tabataTimings } = args;
  const weeks: OutlineWeek[] = args.targetWeeks ?? outline.weeks.filter((w) => w.week >= startWeek && w.week <= endWeek);
  const partsMinutes = inputs.minutes_per_session - frame.warmup_min - frame.cooldown_min;
  const raceList = candidates.raceSessions.size
    ? `\n<race_sessions>\nid | station | name | dose | type | pillar | load\n${formatRaceSessions(candidates)}\n</race_sessions>\n`
    : '';
  const finalWeek = outline.weeks.length;
  const longRuns = inputs.running.mode === 'programmed' && runningLevel(inputs) === 'normal'
    ? longRunPlan(inputs.longest_run_min, athlete.level === 'advanced', outline.weeks, finalWeek)
    : new Map();

  const shared = `You are writing this athlete's program one week at a time, following the season outline.

<athlete>
${athleteFacts(athlete, inputs, coach, candidates.race)}
</athlete>

<race_format>
${raceFacts(candidates.race)}
</race_format>

<season_outline>
${JSON.stringify(outline)}
</season_outline>

<formats>
Use only these formats for this athlete: ${[...args.availableFormats].join(', ')}.
${formatFormats(candidates, args.availableFormats)}
Tabata part lengths for this athlete: ${tabataTimings.map((t) => `${t.blocks} block(s) = ${t.minutes} min`).join('; ')}
${args.plyoContacts ? `Plyometric foot contacts for this athlete: ${args.plyoContacts[0]}–${args.plyoContacts[1]} per plyometric part.` : ''}
Race simulations must fit the session length: at ${inputs.minutes_per_session} min, plan a partial simulation (some stations with their runs), never a full race.${candidates.race.run_distance_m ? ` Every run segment in a race simulation is exactly ${candidates.race.run_distance_m} m: set run_distance_m to ${candidates.race.run_distance_m}.` : ''}
Running exercises for this athlete (use these ids for any run): ${args.runExerciseIds.join(', ') || 'none'}.
</formats>

Rules for sessions:
- Every session: ${frame.warmup_min} min warm-up + parts totalling ${partsMinutes} min + ${frame.cooldown_min} min cool-down = ${inputs.minutes_per_session} min (deload weeks may be shorter). Exception: a strength session that is the day's second session (order_in_day 2), and race week's short strength session, is exactly one 30- or 45-min Strength template with its own warm-up and cool-down.
- Sessions only on ${inputs.training_days.join(', ')}; up to 2 sessions a day (order_in_day 1 and 2; see can_double). Days with one session use order_in_day 1.
- Strength: each week has exactly the outline's strength_sessions core strength sessions. A strength session is a Strength part (a Strength template: working sets × reps), never a circuit; strength-endurance circuits and station work count as hybrid sessions, not strength (including when strength endurance is the athlete's limiter). strength_placement "with_hard_sessions": each strength session is the second session (order_in_day 2) on a day with a hard session (the key session or another hard run, conditioning, circuit or station session), straight after it. Never leave strength alone on a day while a hard day has no strength session yet; only extras beyond the hard days go on other days, never on recovery days. "own_days": give them days without another hard session, not the day after a key session, followed by an easy, recovery or rest day. Deload weeks: 1 core strength session plus 1 optional strength session (optional: true, slot "deload-strength") when the athlete normally does 2 or more; both maintain (fewer working sets, same load and intent). Taper and race-week strength is maintain. strength_choice "own" or "none": no programmed strength sessions (strength_sessions is 0); with "own", plan around their own sessions.${args.raceStrengthDays.length ? ` Race week's strength session is on ${args.raceStrengthDays.join(' or ')} (at least 5 days before the race).` : ' Race week has no strength session.'}
- Use only the exercises, templates and race sessions listed below, by their exact id. Never invent an exercise or rename one.
- Strength, Circuit and Mobility parts use a template: set template_id, set minutes to the template's part length, and give exactly one item per slot, in slot order, whose movement pattern fits the slot (and body region, where the slot names one). Other formats have template_id null.
- Each item sets exactly one of exercise_id or race_session_id; the other is null. Set block only for Tabata items, foot_contacts only for plyometric drills, run_minutes only for running in compromised parts, and run_distance_m only for run segments in race simulations${candidates.race.run_distance_m ? ` (${candidates.race.run_distance_m} m)` : ''}. Leave the others null.
- Running exercises are marked R; they only go in ${inputs.running.mode === 'programmed' ? 'Run, ' : ''}RaceSim and Compromised parts.${inputs.running.mode === 'programmed' ? ' Run parts set run_type (key, easy, long or recovery).' : ''}
- Leave out fields that don't apply (cue, block, foot_contacts, run_minutes, run_distance_m, template_id, run_type, slot, note) instead of sending them empty.
- Optional sessions have optional true and a short slot key that stays the same across the block's weeks (for example "extra-intervals"), so the athlete's completions can be counted. Core sessions have optional false and slot null.
- Title each session by what it contains: name only exercises and equipment actually in it. Station skill is never a day's only main session.
- Mark exactly one core session a week as the key session, on ${inputs.key_session_day}. ${inputs.running.mode === 'programmed' ? `It is the main interval session: a Run part with run_type key at RPE 8 or more${intervalIntroWeek(inputs) ? `, from program week ${intervalIntroWeek(inputs)}; before that, the week's main aerobic run (run_type key)` : '; while walk–run builds to continuous running, the week\'s main walk–run or aerobic run (run_type key)'}.` : `It is a hard (build) strength session (it may stand alone on its day), an off-feet interval session at RPE 8+ (erg, bike or bodyweight), a race simulation${inputs.running.mode === 'own_plan' ? ', a compromised session' : ''} or a hard AMRAP/EMOM-type workout.`} Never station skill, easy, recovery or core/mobility (core/mobility only in a taper or post-event week); for beginners, a smaller dose of real quality work.
- Give each week's progression: the lever from the outline and, in one sentence, what changes.

<exercises>
id | name | movement | body region | methods | pillar | flags (T = Tabata-suitable, R = running)
${formatExercises(candidates)}
</exercises>

<templates>
id | format | focus | part length | slots
${formatTemplates(candidates)}
</templates>
${raceList}${candidates.compromised.size && args.availableFormats.has('CompromisedRun') ? `
<compromised_sessions>
CompromisedRun parts set template_id to one of these (the athlete's level), scale the rounds within the range, and progress one thing at a time (stressor time, density, movement, running volume or recovery). Stations are exercises from the list above that fit the movement patterns shown; loads by feel. Efforts as written (RPE).
id | name | one round | rounds | stations | purpose
${formatCompromised(candidates)}
</compromised_sessions>
` : ''}`;

  const reference = args.referenceWeek
    ? `<week_1>\n${JSON.stringify(args.referenceWeek)}\n</week_1>\nWeek 1 of this block is written. The other weeks are being written at the same time, each from week 1 and the outline, so progress from week 1 by following each week's lever in order (${outline.weeks.filter((w) => w.week > args.referenceWeek!.week && w.week <= endWeek).map((w) => `week ${w.week}: ${w.lever}`).join('; ')}). Keep the same session structure and optional slot keys as week 1, and never repeat a week-1 quality session unchanged (easy, recovery, optional and maintain sessions may repeat). A programmed long run grows by at most 10 minutes a week from week 1's.\n`
    : '';
  const previous = args.previousWeek
    ? `<previous_week>\n${JSON.stringify(args.previousWeek)}\n</previous_week>\nProgress from the previous week; never repeat one of its quality sessions unchanged (easy, recovery, optional and maintain sessions may repeat).\n`
    : '';
  const adjustment = args.adjustment ? `<adjustment>\n${args.adjustment}\n</adjustment>\n` : '';
  const weekly = `${reference}${previous}${adjustment}<targets>
${weeks.map((w) => {
    const needs = weeklyNeeds(inputs.running.mode, w.core_sessions, w.strength_sessions ?? 0);
    const lr = longRuns.get(w.week);
    return `Week ${w.week}: ${w.phase}, ${w.load} load${w.deload ? ', deload' : ''}${lr ? `; long run ${lr.label}, ${lr.minutes[0]}–${lr.minutes[1]} min: ${lr.structure}` : ''}; lever ${w.lever}; exactly ${w.core_sessions} core sessions (${w.strength_sessions ?? 0} of them strength), up to ${w.optional_sessions} optional; key session on ${inputs.key_session_day}: ${w.key_session}; focus: ${w.focus}${needs.length && w.week !== finalWeek ? `; core sessions must include (each in a different session): ${needs.join(', ')}` : ''}`;
  }).join('\n')}
</targets>

Write ${startWeek === endWeek ? `week ${startWeek}` : `weeks ${startWeek} to ${endWeek}`}.${startWeek === endWeek && !args.referenceWeek && !args.adjustment ? ` The summary describes the whole block (weeks ${startWeek} to ${outline.weeks.filter((w) => w.week >= startWeek).slice(0, 4).at(-1)?.week ?? startWeek}).` : ''}`;
  return { shared, weekly };
}

/** The user message: the shared part is cached, so later weeks of a block read it from the cache. */
export function blockContent(parts: BlockPromptParts) {
  return [
    { type: 'text' as const, text: parts.shared, cache_control: { type: 'ephemeral' as const } },
    { type: 'text' as const, text: parts.weekly },
  ];
}

export function repairPrompt(errors: string[]): string {
  return `Your answer broke these rules:
${errors.map((e) => `- ${e}`).join('\n')}

Return the complete corrected answer: every week and every session, not only the ones you changed. Follow all the original rules.`;
}
