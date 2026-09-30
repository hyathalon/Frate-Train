# Onboarding & Weekly Check-In — Final Wording

**Purpose:** The exact questions, answer options and app rules for sign-up, the weekly check-in, session logging, the weekly adjustment, athlete control and pillar suggestions. Replaces the check-in spec in `HANDOFF-for-vscode-claude.md` (task 2), which said energy/sleep "good / OK / poor".

Principles:
- Onboarding takes about 3 minutes. The weekly check-in takes 30–60 seconds.
- Follow-up questions only appear when needed.
- All readiness sliders go the same way: **10 = good**.
- No "HYROX" in the app. Use general Hyathlon language.
- Body reports are health data (see §4).

`Field` = suggested app field name. Map equipment answers to the existing equipment vocabulary in the code.

---

## 1. Onboarding (sign-up)

### Screen 1: Your goal
**1. What's your main goal event?** *(required)* `event_goal`
- A Hyathlon race → division (Open · Pro · Doubles) + event name (optional text) + date
- A running race → distance + date
- No event in the next 3 months: general fitness and strength *(the program runs in rolling 4-week blocks)*

**1b. Any other events this year?** *(optional)* `other_events[]`
- Add as many as you like: event name · type (Hyathlon race / running race + distance / other) · date · "Race it" or "Run it as training"
- Helper text: "You can add events any time from your calendar."

**1c. When was your last race?** `last_race`
- In the last 4 weeks → what was it (Hyathlon race / marathon or longer / half marathon / 10 km or shorter / other) + date
- More than 4 weeks ago / never

**1d. How many Hyathlon races have you done?** `hyathlon_races_count` — 0 · 1–2 · 3–5 · 6+
- 3 or more → standard compromised sessions (`08` A3) from the first program; otherwise entry-level (`08` A2b) for the first program.

**2. How do you want running in your program?** *(required)* `running_choice`
- Program my running
- I already have a run plan → which days, and is each run hard or easy?
- No running (off-feet training only) → **2c. What would you like in your off-feet program?** `off_feet_includes` (select any): Hyathlon race simulations (run segments swapped for your preferred erg or bike) · Erg sessions (SkiErg / row) · Bike sessions

**2b. Which days suit your hardest session and your long run?** *(optional)* `preferred_key_day`, `preferred_long_run_day`
- Mon–Sun chips for each · "No preference" (the app picks)

**3. How long have you been training consistently?** `training_age`
- Less than 6 months · 6–12 months · 1–3 years · 3+ years

**3b. What holds you back most in a race?** `limiters` (select up to 2)
- Running · Strength · Strength endurance (stations fall apart late in the race) · Aerobic fitness · Not sure
- "Strength endurance" allows a 3rd strength session a week.

### Screen 2: Your running *(skipped if Q2 = No running)*
**4. How many times a week do you run at the moment?** `runs_per_week`
- 0 · 1 · 2 · 3 · 4 · 5+

**4b. Have you done interval sessions before (e.g. reps with recoveries)?** `interval_experience` — Yes · No
- No → first week is aerobic runs only; 30 s efforts come before the first interval session (`07` §4).

**5. What was your longest run in the last 3 weeks?** `longest_run_min` (integer 0–300)
- Number entry in **minutes**
- Tick box: "I haven't run in the last 3 weeks" (saves 0)
- Tick box: "Not sure" → follow-up: **"Can you run 20 minutes without stopping?"** `can_run_20_min` — Yes (normal programming) · No (Beginner 2)
- Sets the starting running level (`07` §1): 0 → Beginner 1 (walk–run); under 20 min → Beginner 2; 20+ min → normal programming.
- **Beginners (0 or under 20 min) also see a pre-exercise screening prompt** (e.g. the ESSA screening tool): "If you answer yes to any question, check with your doctor before starting."

**6. Do you have a recent race or time-trial result?** *(optional)* `recent_result`
- Distance or event · time · date
- For a Hyathlon race, also: **average run pace** (e.g. 4:45 /km). This is the best anchor for your personal zones.
- Helper text: "This helps us set your personal training zones. Skip it if you don't have one."

### Screen 3: Your week
**7. How many days a week can you realistically train?** `days_available`
- 2 · 3 · 4 · 5 · 6 · 7

**8. Are there any days you can't train?** `days_unavailable`
- Mon · Tue · Wed · Thu · Fri · Sat · Sun (select any) · None

**9. How much time do you usually have for a session?** `session_min`
- Under 30 min · 30–45 min · 45–60 min · 60–90 min · 90+ min

**10. Where do you usually train?** `training_locations` (select all)
- Gym · Home · Outdoors

**10b. Can you train twice in a day?** `can_double`
- No · Sometimes · Yes

**10a. How do you want strength in your program?** `strength_choice`
- Program my strength
- I already do strength or classes (e.g. F45, CrossFit, my own strength coach) → for each: a title, which days, hard or easy, and *optionally* the exercises and sets
- No strength
- If "I already do…": 10c and 10d are skipped. Those sessions count in the athlete's load and runs are planned around them (interference rule).

**10c. When would you like your strength sessions?** `strength_placement`
- Same day as my hard sessions *(recommended: keeps your easy days easy)*. Strength is a separate session later that day, or straight after the run if you can't train twice.
- On their own days
- Helper text: "You can change this any time, or move a session in any week."

**10d. How many strength sessions a week would you like?** `strength_sessions_pref`
- 2 *(recommended for most athletes)* · 3 · 4 · 5 · 6
- Helper text for 3+: "More sessions mean more recovery cost. Great if you want an upper / lower / core split. We'll place them where they cost your running least."

### Screen 4: Your equipment
**11. What equipment do you have access to and would use for strength training?** `strength_equipment` (select all)
- Bodyweight only · Dumbbells · Kettlebells · Barbell and plates · Resistance bands · Cable machine · Pin-loaded machines · Smith machine · Pull-up bar · Bench · Sled · Sandbag · Wall ball · Full gym · Other (text)

**12. What equipment do you have access to and would use for off-feet cardio?** `off_feet_equipment` (select all)
- Air bike · BikeErg · Bike (indoor or outdoor) · Elliptical · SkiErg · Rowing erg · Treadmill · Pool: swimming · Pool: aqua / pool running · None

**13. Rank your off-feet options from favourite to least favourite.** `cross_training_preferences` (ordered list, max 8)
- Drag to rank. Only shows what was selected in Q12.
- Helper text: "When we swap a run for cross-training, we'll use your favourite first."

**14. How much variety do you like?** `variety_preference`
- Mostly the same sessions · A balance · Lots of variety

**15. Anything you dislike or won't do?** *(optional text)* `dislikes`

### Screen 5: Your body *(member accounts only, after the consent step; see §11)*
**16. Is there anything you're currently noticing in your body?** `current_body_reports`
- No
- Yes → same body-report questions as the weekly check-in (§2, Q4–Q7)

**17. Any injuries in the last 12 months?** `injury_history` — area · type (e.g. calf/Achilles, bone stress) · roughly when · back to full training? (yes / not yet)

**18. Would you like your program to take your menstrual cycle into account?** `cycle_tracking` — No · Yes → cycle length and last start date, plus *optional*: when in your cycle you usually feel strongest, and when you feel weakest or more tired

Footer text: "We use this to adjust your training. It isn't medical advice. If something persists or worsens, check with your medical professional."

---

## 2. Weekly check-in

### Readiness (three sliders, 0–10, 10 = good)
**1. How fresh do your body and legs feel?** `fresh` 🪫 → 🔋
- 0 = completely drained · 10 = fully fresh
- *(This is the fatigue question, turned round so 10 = good.)*

**2. How has your energy been over the last few days?** `energy` 😩 → ⚡
- 0 = flat · 10 = full of energy

**3. How well have you slept over the last few days?** `sleep` 😵 → 😴
- 0 = very poorly · 10 = really well

### Body check
**4. Anything you're noticing in your body?** `body_reports[].category`
- 😊 Nothing
- 👀 Awareness: *I can feel it, but it doesn't hurt or change how I move.*
- 💪 Soreness: *general muscle soreness from training that eases as I warm up and fades in a day or two.*
- ⚠️ Niggle: *one specific spot that keeps bothering me, but I can still train normally.*
- 🛑 Pain: *it hurts, changes how I move, or gets worse as I train.*

If not "Nothing", show Q5–Q7. Button: "+ Add another area".

**5. Where?** `body_reports[].area` + `side`
- Foot · Ankle · Achilles · Calf · Shin · Knee · Hamstring · Quad · Hip / groin · Glute · Lower back · Upper back / neck · Shoulder · Elbow · Wrist / hand · Other (text)
- Left · Right · Both

**6. How much does it hurt at its worst?** `body_reports[].rating` (0–10 slider; hidden for Awareness)
- 0 = no pain · 10 = worst pain imaginable

**7. Compared with last week, is it…** `body_reports[].trend` (hidden the first time an area is reported)
- Better · Same · Worse

### Your week
**8. Has anything changed with your availability this week?** `availability_changed`
- No
- Yes → days available this week (Mon–Sun chips) + time per session (same options as onboarding Q9)

**8b. Travelling this week?** `travel` — No · Yes → which days + what you'll have: Hotel/other gym · Treadmill only · No equipment
- The app swaps sessions to what's available. With no equipment: bodyweight maintenance sessions.

**9. Anything else your coach should know?** *(optional text)* `note`
- Placeholder: "Travel, work, illness, a race, anything else"

---

## 3. App rules

### Readiness score
- **Score** = average of `fresh`, `energy`, `sleep` (0–10).
- **First 3 check-ins** (no baseline yet): 🟢 7+ · 🟡 5–6.9 · 🔴 below 5.
- **After that**, compare with the athlete's own average over the last 4 check-ins:
  - 🟢 no more than 1 point below their average
  - 🟡 1–2 points below
  - 🔴 more than 2 points below, **or** any single slider at 3 or less
- These thresholds are starting values. Tune them once there is real data.

| Readiness | What happens to the coming week (from `04` Step 9b) |
|---|---|
| 🟢 | As planned |
| 🟡 | Keep session types; use the lower end of RPE ranges and set ranges (`low_readiness_option`) |
| 🔴 | Swap the next key session for a Z1 (RPE 1–4) recovery session or reduce the shift; flag to the coach (member accounts) |

The athlete sees their colour and one line about what changed (e.g. "Tuesday's intervals trimmed from 6 to 4 reps"). No numbers shown.

### Body reports: wait and watch, then act
The rating decides, not the label. Small things get watched before the plan changes.

| Report | What happens |
|---|---|
| Awareness | No change. Logged, and asked about again next week |
| Soreness or niggle rated **3/10 or less** | **Wait and watch.** No change to the plan. The athlete can update the report any time during the week (e.g. from the Today screen), and it's asked about again at the next check-in |
| Wait and watch with trend "Worse" | Still no change to the plan, plus the message *"If this persists or worsens, check with your medical professional"* |
| Soreness or niggle rated **4/10 or more**, or any **Pain** report | Affected running sessions go **fully off-feet** on the athlete's favourite modality, same purpose and RPE. Nothing that loads that area in the coming week. Show *"If this persists or worsens, check with your medical professional"*. Coach flag (member accounts). When it's back to 3/10 or less, the 2-week build-back starts (`03` / `04` Step 9b) |

Pain is treated like a 4+ whatever its rating, because by definition it changes how the athlete moves. The app gives considerations only, never medical advice.

### Availability
- Less time: keep the key session(s), drop or shorten the rest. Optional sessions go first.
- More time: offer one extra **optional** session (one new stimulus at a time). Optional sessions never break streaks.

---

## 4. Health data handling
- Body reports and ratings are health data. Store them behind row-level security so only the athlete (and their coach, for member accounts) can read them.
- Send program generation only what it needs: category, area, side, rating, trend. Don't send free-text notes about the body.
- Don't send body reports to any third party.

---

## 5. Session log (after each session)
Kept to a few taps. This is what the weekly adjustment reads.

**0. How did it feel?** `session_feel` — 😄 Great · 🙂 Good · 😐 OK · 😕 Poor · 😣 Awful *(feeds the load graph alongside session RPE)*
**1. How hard was the session overall?** `session_rpe` (0–10 slider)
**2. What did you complete?** `completed` — sets done, or duration, pre-filled with the plan so the athlete only changes what was different
**3. Who did you train with?** `training_with` (optional) — Solo · With a friend · Group session · With my coach
**4. Where?** `location` (optional) — Gym · Home · Outdoors
**4b. Comment for your coach** *(optional text)* `session_comment`
**5. Did you change the session?** `modification_reason` (only shown if completed ≠ planned) — Couldn't finish the sets · Couldn't hold the effort · Short on time · Niggle · Felt great, did more · Other

A planned session with nothing logged by the end of its day is marked **missed** (the athlete can still log it late).

---

## 6. Weekly adjustment: the plan follows the training
At the end of each week (after the check-in, or on the athlete's chosen day if they skip it) the app drafts next week, then the athlete decides.

### What it reads
- Missed sessions
- Planned vs completed (sets, duration, sessions per week) and the modification reasons
- Session RPE vs target RPE
- Athlete-added and moved sessions (they count in load)
- The check-in: readiness colour, body reports, availability

### How it adjusts (one change at a time, as in `04`)
| Signal | Adjustment |
|---|---|
| Missed sessions | **Never stacked onto next week.** Missed key session → keep the next one, don't double up. Most of the week missed → repeat the week instead of progressing |
| Ran hot: 2+ sessions logged about 1 RPE above target, or "Couldn't hold the effort / Couldn't finish the sets" twice | Trim volume, keep session types (lower end of set ranges) |
| Ran easy: 2+ sessions about 1 RPE below target for 2 weeks, or "Felt great, did more" | Progress **one** manipulator (Extend or Qualify) |
| Readiness 🟡 / 🔴 | As in §3 |
| Body report 4/10+ or Pain | Off-feet, as in §3 |
| Availability change | As in §3 |

### What the athlete sees
- A short **"What changed and why"** card (max 3 lines), e.g. *"Thursday intervals 6 → 4 reps: last week's sessions ran about 1.5 above target."*
- Buttons: **Accept** · **Keep original** · **Edit**
- If they don't respond, the adjusted week is used.
- No guilt language about missed sessions. The plan just recalibrates.

---

## 7. Athlete control

**Core principle: the app recommends, the athlete decides.** Our training rules decide what the app *generates*. The athlete can always personalise it, even against those rules: add, move, modify or lock sessions, and change their preferences. When a change goes against a rule, the app shows a short, friendly note about the trade-off (e.g. recovery cost) and then lets them go ahead. Notes, never blocks. The only limits: coached members can't delete coach-set key sessions (they can move or modify them), and body-report messages still say "check with your medical professional".


| Action | Self-serve athlete | Coached member |
|---|---|---|
| Accept, keep original or edit the adjusted week | ✅ | ✅ (coach sees it) |
| Move a session to another day | ✅ | ✅ |
| Modify a session (fewer sets, shorter, lower effort, swap to an off-feet alternative) | ✅ | ✅ with a reason chip; coach sees it |
| Add a session (their own or from the workout builder) | ✅ | ✅ |
| Lock a session (e.g. a Saturday group run) so the app always plans around it | ✅ | ✅ |
| Delete a key session | ✅ | ❌ Coach only (athlete can move or modify it, or mark it missed) |

- Everything the athlete adds, moves or modifies is logged and **counts in their load**, so next week accounts for it.
- **Guardrails are notes, not blocks.** Examples: adding intervals the day before a key run ("You've got intervals tomorrow. Want to move this?"); adding running while a body report is 4/10+ (consideration + "check with your medical professional"). The athlete can still go ahead.
- Optional sessions and athlete-added sessions never break streaks.
- **Strength on a recovery day:** the app never puts it there, but the athlete can add or move one there. Warning: *"This is on a recovery day. It may slow your recovery before your next hard session, but doing it is better than not doing it."* [Keep it here] [Move it]

---

## 8. Pillar suggestions
Each week the app checks the last 3 weeks of logs against the Hyathlon pillars. If a pillar hasn't been touched, it offers an **optional suggestion** alongside the adjusted week.

| Pillar | "Not touched" when… | Example suggestions |
|---|---|---|
| **Connection & Courage: Connection** | No sessions logged "With a friend / Group session / With my coach" and no coach message in 3 weeks | "Train with others this week: join a group session, or do your long run with a friend." · "Swap one home session for the gym." · "Send your coach a quick update on how training's going." (members) |
| **Connection & Courage: Courage** | No event set, no benchmark or new session tried in the block | "Pick a race and put a date on it." · "Try this week's benchmark session." · "Give a session you haven't done before a go." |
| **Economy** | No strides, drills or hill sprints in 2 weeks | "Add 4–6 strides after one easy run." |
| **Balanced Athleticism** | No strength or mobility logged in 2 weeks | "Add 10 minutes of mobility, or one strength session from the builder." |
| **Fatigue Management** | No recovery session or rest day in 2 weeks, or readiness 🟡/🔴 two weeks running | "Make one day this week an RPE 1–4 recovery day." |

Aerobic Engine, Threshold, Durability and Training Principles are driven by the plan itself, so they don't get suggestions. If an athlete keeps skipping those sessions, the weekly adjustment handles it.

Rules:
- Max **2 suggestions** a week. Connection first if it's due.
- One tap: **Add to my week** or **Not this week**. A dismissed suggestion isn't repeated for 2 weeks.
- Never suggest extra load when readiness is 🔴 or a body report is 4/10+. Connection and recovery suggestions are still fine.
- Positive framing, never guilt. Suggestions are optional and never affect streaks.
- Suggestions come from these app rules, not the AI, so they cost nothing to generate.

---

## 9. Plan your next block (before each 4-week block)
Before the app generates the next 4 weeks, the athlete sees a short **"Plan your next block"** screen. Everything is pre-filled from their current answers, so most athletes just tap **Looks good**.

It shows what they actually did last block (sessions per week, long run, strength sessions), then lets them change:
- Event and date (or "no event")
- Days available and time per session
- Can train twice in a day
- Running choice (program my running / I have a run plan / no running)
- **Strength sessions per week** (2 recommended · 3 · 4 · 5 · 6) and placement (with hard sessions / own days)
- Limiters
- Equipment
- Anything coming up in the next 4 weeks (travel, a race, a busy period) — optional text

Buttons: **Looks good** · **Change something**

## 10. Changing preferences any time
**Settings → My training preferences** shows every onboarding answer and lets the athlete edit it.

| Change | When it takes effect |
|---|---|
| Days available, time per session, can train twice | Next week (through the weekly adjustment) |
| Strength sessions per week or placement, running choice, equipment, variety, dislikes | Next week's draft |
| Event, event date, goal | Offer **"Rebuild my plan from next week"** (new outline), or keep the current plan until the block ends |
| Limiters | Next block |

- The athlete sees one line confirming when the change applies, e.g. *"Got it. Next week will have 3 strength sessions."*
- Coached members: the coach is notified of changes. Coach-set key sessions stay unless the coach changes them.

---

## 11. Member-only features (consent required)
Behind the privacy checklist and an explicit consent step. Not available to self-serve athletes.
- **Body reports** (onboarding Q16, weekly check-in Q4–Q7) and the wait-and-watch / off-feet rules.
- **Injury history** (Q17): athletes with a recent calf, Achilles or bone-stress injury start with no hills and nothing faster than 5–15 km effort; hills, VO2max and speed return once the first block goes well.
- **Return to run after a longer injury:** a walk–run progression (stages), then a short easy test run, with off-feet bike/erg sessions keeping fitness. Progression follows the athlete's medical professional; the app gives considerations only.
- **Menstrual cycle** (Q18): the program can adapt to where the athlete is in their cycle, using what *they* report about when they feel strongest (place key sessions and efforts there) and weakest (lower end of ranges, easier options). Considerations only.
- **Coach restrictions and focus:** the coach can block session types (e.g. "no hill sprints", "no running during a strength block") and set a goal focus; the generator respects them.
- **Hidden planned sessions:** the coach can plan ahead; the athlete sees those weeks later.

## 12. Events and the calendar
- Athletes can **add, edit or remove events any time** from the calendar (name, type/distance, date, race it or run it as training). The plan adapts from the next week.
- Not every event needs a taper. "Race it" events get a lighter day or two before and recovery after; "run it as training" events replace that day's session.
- **Recovery after a race** depends on how demanding it was:

| Event | Before quality run sessions return |
|---|---|
| Marathon or longer | 3 weeks (easy running and off-feet only) |
| Half marathon | 1 week |
| Hyathlon race | 1 week |
| 10 km or shorter | Straight back into it |

- **After an event**, the athlete is asked: *"What do you want training to look like now?"* — Recover, then keep building to my next event · Maintain for a while · Take a break · New goal (rebuild my plan).

## 13. Weekly focus and block banner
- Each week shows a **focus line** at the top: for self-serve athletes it's generated from the week's main pillar (e.g. "Threshold week: hitting each quality run is the focus"); for members it's the coach's note (generated draft the coach can edit).
- A **block banner** across the weeks names the phase (e.g. "Base: building your engine", "Maintenance during 3 weeks of strength focus").
- Every session shows a short **"Why this session"** line (its purpose and main benefit).
- The calendar shows **planned vs completed totals** per week by type (run, bike, strength, etc.).

## 14. Logging from watches
Uploads don't always line up with the plan. The app needs to:
- **match an upload to the planned session** (same day and type) instead of showing it as a separate unplanned workout;
- **merge split uploads** (warm-up, each interval and cool-down uploaded separately) into one session;
- **credit a session done a day late** (or early) against the planned one.

## 15. Workout mode (in the gym)
A one-page view for doing a strength, circuit or hybrid session without typing as you go.

**During the workout**
- Tap **Start workout** → every exercise on **one page**, in order (supersets grouped, e.g. A1/A2), so the athlete can scan the whole session quickly.
- Each exercise shows: planned working sets × reps, the effort cue ("Hard, with intent: finish with 1–2 good reps left"), and **last time's weight** (and reps) for that exercise, pre-filled. If there's no history, the weight field is blank.
- Optional: tap a set to tick it off. No typing needed during the session.
- Warm-ups aren't listed as sets ("ramp-up sets as needed").
- Should work with poor gym signal (save locally, sync later).

**Finishing**
- Tap **Finish workout** (or **Close** to leave without saving).
- **Sets completed:** a **Select all** tick ("Completed as planned"), or change the sets done per exercise.
- **"Did you increase any weights?"** — No (saves the pre-filled weights) · Yes → the weight fields open to edit, pre-filled with last time's weights.
- Then the usual session log (§5): feel emoji, session RPE, optional comment.

**Why it matters**
- The logged weights, sets and reps are the athlete's history for **progressing one lever** next time (e.g. more load once all sets were completed with good reps left), and they feed the load graph.
- Works for the athlete's own classes too, if they've added exercises (Q10a).

## 16. Modifications and credits
- **Included for everyone:** the automatic end-of-week adjustment (§6) and the athlete's own edits (adding, moving, modifying or locking sessions, §7). These are not AI replans.
- **A "modification" is an athlete-requested replan:** e.g. "Rebuild my plan from next week", or regenerating the current week mid-week.
- **Members:** unlimited modifications.
- **Self-serve athletes:** 2 modifications a month included *(placeholder, coach to confirm)*; buy **4 more for $10**, the same as extra program confirmations.
- Before using a credit, the app says so: *"This will use 1 of your 2 plan changes this month."* When they run out: *"You've used your plan changes for this month. Get 4 more for $10, or keep editing sessions yourself for free."*
