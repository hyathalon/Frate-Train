# Step-by-Step: How Claude Designs a Workout or Program

**Follow this every time you design a session, a week or a block.** Reference docs:
- `00-training-zones.md`: zones, RPE, session types, modality effort guide
- `01-workout-design-principles.md`: extend/qualify, the 9 manipulators, the 5-step decision process
- `02-running-workouts.md`: running
- `03-cross-training-workouts.md`: ergs, stations, strength endurance, hybrid
- `06-strength-principles.md`: strength work — intensity before volume before frequency, working sets only, low volume/high effort, consolidating stress onto hard days
- `05-training-methods.md`: each training method (recovery → sprints, hills) with zone, RPE, work, recovery and total
- `../app/onboarding-and-check-in.md`: onboarding inputs, weekly check-in, readiness colour and body-report rules (used in Step 1 and Step 9b)

---

## Part A: Designing a single session

### Step 1. Gather the inputs
Collect (or ask the coach for) the following before writing anything:
- **Goal:** event/race type and date, current phase (base / specific / taper), weeks to go.
- **Athlete history:** recent logged sessions, especially the last session of the same type, and output at each zone.
- **Stored zone values:** the athlete's dated pace/power/HR per modality, if they exist.
- **Availability:** sessions per week, time per session.
- **Equipment and preferences:** modalities the athlete has access to (pool, bike, elliptical, ergs, stations) and their ranked preference.
- **Longest run in the last 3 weeks:** sets the starting long run.
- **Latest weekly check-in:** soreness, niggles, fatigue, availability changes (see Step 9b).
- **Strengths and weaknesses:** from the coach or athlete.
- **Readiness:** sleep, life stress, HRV/HR, soreness, recent hard sessions or races.
- **Other training:** the strength coach's plan for the week.
- **Considerations:** injury or pain notes. These are for awareness only, never medical advice.

If a key input is missing, make a conservative choice and state the assumption.

### Step 2. Set the direction (what adaptation?)
- Name the **pillar** (Aerobic Engine, Threshold, Durability, Economy, Balanced Athleticism, Fatigue Management).
- Name the **adaptation** in one line, e.g. "extend ability to hold Z3 under fatigue".

### Step 3. Find the norm
- Look up the **last similar session** and what the athlete handled physically and mentally.
- Note whether the limit was fitness, or the mental demand of the session (e.g. long reps).
- **No history?** Write a conservative **benchmark** session and label it as one.

### Step 4. Build or maintain?
- **Build:** push toward the top of the challenge window.
- **Maintain:** about 60% of the challenge. Do it and move on.

### Step 5. Decide the size of the shift
- **Default:** just-manageable (low risk, gradual), which covers most sessions.
- **"Go to the well":** only occasionally. It needs a fresh athlete and a rested week, and must be followed by 1–3 cementing sessions (barbell strategy / set point shifting).
- **Low readiness:** keep the session type, reduce the shift.

### Step 6. Choose the session type, zone and modality
- Pick from the session types in `00` §4: recovery, easy/steady, long, progression, aerobic threshold, lactate threshold, critical velocity, VO2max, speed endurance (30–90 s, fitness), sprint intervals (30 s or less, running economy), compromised.
- Assign the zone internally, but **show the athlete RPE + feel word** (e.g. "RPE 8–8.5 · Mod. Hard"). Chart: Z1 1–4 Recovery · Z2 5–6 Easy · Z2 6–8 Steady · Z3 8–8.5 Mod. Hard · Z4 8.5–9.5 Hard · Z5 9.5–10 Very Hard.
- Choose the **modality:** run, or a cross-training alternative from `00` §5. Use cross-training for recovery, extra aerobic volume without impact, managing load, or station-specific work.
- **Give alternatives** for cross-training sessions from the athlete's available equipment, preferred first (e.g. "Pool run, or elliptical, or bike").
- **Z1 (RPE 1–4) is only for recovery sessions, warm-ups and cool-downs.** Easy runs are **RPE 5–6 (Easy)**; long runs are **RPE 6–8 (Steady)**.
- **Long run:** usually 50–90 min, starting from the athlete's longest run in the last 3 weeks and extending in small steps.

### Step 7. Choose ONE manipulator and label the progression
- Compare with the last similar session and change **one lever**: speed/zone, recovery, rep length, terrain/modality, volume, density, "stuff", surges, or feedback/constraints.
- Label it **Extend** (more volume or longer reps at the same zone) or **Qualify** (same work at a higher output, or with less recovery).
- Surges and feedback constraints are mainly for the **specific / race phase**.

### Step 8. Write the session in the standard format

```
Title:
Purpose: <adaptation> | Pillar: <pillar> | Build / Maintain
Session type: <type> | Modality: <run / SkiErg / etc.>
Progression: Extend / Qualify / Benchmark: <what changed vs last time>

Warm-up: <time/distance> @ RPE 1–4 (+ drills/strides if relevant)
Main set: <sets (min–max)> × <reps × work> @ RPE _ / <recovery length + style + RPE>
Cool-down: <time/distance> @ RPE 1–4
Alternatives: <other modalities from their equipment, preferred first>

Athlete values (only if stored): <their pace/power/HR for the zones used>
Execution notes: how it should feel; last rep should feel fast/controlled,
  OR what productive fatigue looks like; when to stop (speed/heavy lifts:
  stop when mechanics break down)
If readiness is low: <scaled option>
```

Rules for the format:
- Intensity is **always RPE** (+ feel word) for the athlete; zones are internal.
- Sets and long-run duration are adjustable: give a planned value with a min–max range. The athlete can go up or down, and the next block is built from what they actually completed.
- Timed insertions are placed by time, e.g. "4×10 s hill sprints @ RPE 9.5–10 at the 20 min mark of the run, walk-down recovery".
- Never write fixed paces, splits, watts or loads into a generic session.
- Loads are described by feel, or as the race-standard weight for the athlete's division.
- Exercises come **from the exercise database** only.

## Part B: Placing sessions in a week

### Step 9. Build the week
1. Place the **key sessions** first (the build stimuli for this phase).
2. Space repeats of the same stimulus:
   - Building: every ~7–14 days (avg ~10).
   - Maintaining: every ~14+ days.
   - Neural work (strides, sprints, heavy/power): little and often.
3. After each key session, schedule a **Z1 (RPE 1–4) recovery** session (run or cross-training) or rest.
4. Fill the remaining volume with **RPE 5–6 (Easy)** work. This is usually the largest share of weekly volume.
5. **Interference:**
   - No heavy lower-body, lunge or sled work within ~24–48 h before a key run.
   - No "go to the well" run within 48 h of a hard station or strength session.
6. Count station and erg work in weekly load, not just running km.
6b. **Consolidate the stress** (`06`): strength, circuits and accessories go on hard days, paired with quality running days as a second session that day (run first, strength later), never on recovery or easy days. Strength is 2 sessions a week (3 only if strength endurance is a limiter), 2–3 working sets, 6–10 reps, max 3–4 exercise groups. Don't add light strength sessions for frequency.
7. Fit around the **strength coach's plan**. Complement it, don't duplicate it.
8. Add **one new stimulus at a time** (e.g. 1 → 2 interval sessions, or 3 → 4 sessions/week). Mark the new addition as **optional ("if you have time")**. Optional sessions never break streaks.

### Step 9b. Weekly modification (check-in)
Each week the athlete can report soreness, a niggle, fatigue or an availability change. Adjust the coming week:
- **Niggle or soreness rated 3/10 or less: wait and watch.** No change to the plan; the athlete keeps reporting it. If the trend is "worse", add "if it persists or worsens, check with your medical professional".
- **Niggle or soreness rated 4/10 or more, or any Pain report (e.g. calf tightness):** make the affected running sessions **fully off-feet** on the athlete's preferred cross-training modality, keeping the same purpose and RPE. Don't combine running and cross-training in one session. Add "if it persists or worsens, check with your medical professional".
- **Returning after a niggle: build back sensibly**, never straight back to the previous level. Progression (adjust per athlete):
  - Week 1 back: easy runs only at RPE 5–6, about 50–75% of previous run duration. Other sessions stay off-feet. No hills, sprints or intensity.
  - Week 2: back towards normal run volume; reintroduce one key session if symptom-free.
  - If symptoms return at any step, go back a step. If it persists: "check with your medical professional".
- **High fatigue / poor sleep:** keep session types, reduce the shift (fewer sets, lower end of the RPE range), or swap a key session for recovery.
- **Less time available:** keep the key session(s), drop or shorten the rest; optional sessions go first.
- Log the modification so the next block reflects what actually happened.
- **Missed sessions:** never stack them onto the next week. Missed key session → keep the next one; most of the week missed → repeat the week.
- **Logged RPE vs target:** 2+ sessions about 1 RPE above target → trim volume, keep session types. About 1 below for 2 weeks → progress one manipulator.
- **Athlete control:** respect locked sessions, and count athlete-added, moved and modified sessions in load. Full rules, permissions (self-serve vs coached) and pillar suggestions: `../app/onboarding-and-check-in.md` §5–§8.

## Part C: Designing a program (app)

### Step 10. Outline, then 4-week blocks
1. Programs are **max 16 weeks**.
2. Give the **full periodisation outline** up front, with phases, dates and the key emphasis of each phase:
   - **Base:** Easy (RPE 5–6) volume and a Steady (RPE 6–8) long run, LT (Z3) emphasis, pure speed, general strength, technique.
   - **Specific:** race-effort / compromised work up to weekly, CV/VO2max blocks, surges and constraints.
   - **Taper:** reduce volume, keep some intensity, no long run in the final taper.
3. Generate **4-week blocks** one at a time.
4. Adapt each new block to what the athlete **actually did**, like a coach would. Example: planned 4 sessions/week but did 2 → next block 3/week.
5. Re-check the norm from the latest logs before each block.

## Part D: Final check before sending

- [ ] Every session states purpose, pillar, and build or maintain.
- [ ] Every intensity is shown as **RPE** (+ feel word), with no generic fixed paces, splits, watts or loads.
- [ ] Warm-ups and cool-downs RPE 1–4; otherwise RPE 1–4 only in recovery sessions.
- [ ] Returning from a niggle: build back sensibly, not straight to the previous level.
- [ ] Cross-training sessions list alternatives from the athlete's equipment; sets/long run have a min–max range.
- [ ] Weekly check-in applied: body report 4/10+ or Pain → affected sessions fully off-feet; 3/10 or less → wait and watch.
- [ ] Each session changes **one** manipulator, labelled Extend / Qualify / Benchmark.
- [ ] Z1 (RPE 1–4) recovery follows hard sessions.
- [ ] Stimulus spacing follows build/maintain frequencies; VO2max only in focused blocks.
- [ ] "Go to the well" sessions are rare, placed when fresh, and followed by cementing sessions.
- [ ] Interference with running and the strength plan has been checked.
- [ ] Strength follows `06`: working sets only, low volume/high effort, on hard days only; recovery and easy days stay free of strength, circuits and accessories.
- [ ] New stimuli are optional; the week is realistic for the athlete's availability.
- [ ] Exercises are from the database; language is general "Hyathlon", not event-branded.
- [ ] Injury/pain notes are considerations only, with "check with your medical professional".
