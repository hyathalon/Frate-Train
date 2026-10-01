# Workout Design — Principles & Decision Process

**Purpose:** Reference for Claude (and coaches) when designing any Hyathlon Performance session — running, stations, strength or hybrid. Read this and `00-training-zones.md` first, then the discipline file:
- `00-training-zones.md` — the 5-zone model (Zone + RPE), session types, and the cross-training effort guide by modality
- `02-running-workouts.md` — running sessions
- `03-cross-training-workouts.md` — stations, ergs, strength endurance and hybrid sessions
- `05-training-methods.md` — each training method with zone, RPE, work, recovery and total

Source: Frates's coaching notes *Designing Workouts*, *Workout Manipulators* and *Workout Decisions*. Cross-training applications are adapted from the same framework.

---

## 1. Core beliefs

- **A single workout is not predictive.** Fitness comes from the combination of sessions across the program, not one "magic" session.
- **There are no magical workouts or zones.** Training is about adapting to a stimulus.
- **The coach's job:** find the athlete's *norm* — physiologically and psychologically — and then shift it.
- **Disturb the system to force adaptation.** Varying intensity, volume, recovery etc. subtly shifts the stressor, and so the adaptation.
- **Last rep matters.** Athletes should finish reps feeling fast / in control (unless the session is deliberately a "go to the well" session — see §5).
- **Stress in the direction you want to adapt.** Intensity and volume are easy to measure so coaches over-use them; there are many other levers (see Manipulators).

## 2. Intensity is prescribed by Zone + RPE — never by fixed paces, splits or loads

Paces, erg splits, watts and loads are specific to each athlete, so **every session prescribes intensity using the 5-zone model in `00-training-zones.md` (Zone + RPE)**. Numbers such as a 400 m time, a 500 m row split or a sled load are **never written into a generic session**. They only appear as that athlete's own logged results or stored zone values.

| Zone | Feel | RPE | Race-pace reference |
|---|---|---|---|
| Z1 | Recovery | 1–4 | Recovery |
| Z2 | Easy | 5–6 | Easy |
| Z2 | Steady | 6–8 | Steady – marathon |
| Z3 | Moderately hard ("sweet spot") | 8–8.5 | 15 km – half marathon |
| Z4 | Hard | 8.5–9.5 | 10 km – 5 km |
| Z5 | Very hard | 9.5–10 | 3 km and faster |

Passive rest (standing or walking between reps) sits below Z1.

**Athlete-facing label is RPE + feel word** (e.g. "RPE 5–6 · Easy"), because people read "Zone 1 / Zone 2" differently. Zones are kept internally. Z1 (RPE 1–4) is for recovery sessions, warm-ups and cool-downs; easy runs are RPE 5–6 (Easy) and long runs RPE 5–6 for beginner–intermediate runners, 6–7 for advanced.

- **Zone/RPE prescribes; performance measures.** The athlete trains to the zone, and their logged pace, split, watts or load at that zone shows whether the norm has shifted.
- A race-pace reference ("roughly 10 km effort") or a load-by-feel reference ("a load you can push 25 m at Z3") may be added.
- Coach-built programs for a specific athlete may add that athlete's own pace/power/HR **next to** the zone, never instead of it.

## 3. Progress a workout by *extending* or *qualifying*

Every repeat of a workout type should either extend or qualify the previous one. Change **one lever at a time** so you know what caused the adaptation.

| Change (baseline 10×400 m @ Z4 / 90 s rest) | Type | What it tells us |
|---|---|---|
| 12×400 m @ Z4 / 90 s | **Extend** (volume) | Can handle more total work before fatigue shuts us down |
| 10×500 m @ the same effort / 90 s | **Extend** (rep length) | Specific endurance at that effort lasts longer |
| 10×400 m @ Z4 with faster logged splits, or a step up to upper Z4 | **Qualify** (speed) | Same fatigue, faster output |
| 10×400 m @ Z4 / 60 s | **Qualify** (recovery) | Same effort under a higher stress load |

Same logic applies to every session type. Long run: **extend** 13 → 15 km, or **qualify** by adding 20 min of pickups (Z3) in the middle of the 13 km. Station circuit: **extend** by adding a round, or **qualify** by holding the same zone and output with less rest.

## 4. The nine workout manipulators (summary)

Full detail and examples in the discipline files.

1. **Speed / intensity** — general increase in effort/output, or change within the rep (e.g. progressive effort).
2. **Recovery** — length; style (standing vs moving); speed of recovery; "stuff" inserted into the recovery (strength circuit, cognitive task).
3. **Rep length** — extend distance/time at the same zone.
4. **Terrain / environment** — hills, soft, hard, variable surfaces; for stations: implement, floor, load setup.
5. **Volume** — total, and how it's split across sets (3×4 vs 2×6).
6. **Density** — how much space is in the session: set breaks, slower reps inserted.
7. **"Stuff"** — aerobic/clearing segments, sprints (esp. hill sprints), strength inserted mid-session.
8. **Surges** *(race specific)* — uneven pacing, surges on signal, fast finishes.
9. **Feedback & constraints** *(race specific)* — remove knowledge (splits, rep count, distance), effort-based stopping.

## 5. Workout decision process (5 steps)

### Step 1 — Adaptation & direction
What are we trying to improve? Endurance or speed? Extending the ability to last at race pace, or taking them to the next level of speed? Map this to a Hyathlon System pillar (Aerobic Engine, Threshold, Durability, Economy, Balanced Athleticism, Fatigue Management…).

### Step 2 — Identify their norm
For each workout type, what can they handle *now* — physically, mentally, emotionally? Is the session at the edge of do-ability because of fitness, or because it's mentally demanding (e.g. long reps)? You must know the norm before you shift it. In the app, the norm comes from the athlete's logged history (output at a given zone), not assumptions.

### Step 3 — Build or maintain?
Building needs a push near the edge; maintaining can be done at ~60% of the effort and "called a day". **Strength exception:** maintain strength with the same load and intent but fewer working sets, not lighter loads (`06`).

### Step 4 — How big a shift?
Just-manageable challenge, or "going to the well"? Use the heuristics:

- **Barbell strategy** (Taleb, *Antifragile*): most work is low-risk / low-reward gradual progression; a small dash is high-risk / high-reward envelope-pushing. Avoid living in the medium-risk middle.
- **Set point shifting:** lasting change comes from gradual shifts of the set point. Big "see god" sessions are *perception challengers*; follow them with a few manageable *cementing* sessions to lock the adaptation in. Need both — be judicious.
- **Productive fatigue:** in hard sessions it's OK for the athlete to slow and hold on, as long as the fatigue is productive — near mechanical breakdown but adjusting (arm swing, cadence, grip, bracing) to hold form. *Unproductive* = full breakdown/flailing, or mentally giving up by choice. Sometimes trade mechanical quality for psychological lessons (learning to hold it together mentally). **Exception:** pure speed and heavy/technical strength work stop when mechanics deteriorate.
- **Optimal challenge window:** each session has a window — below it too little stress, above it too much. Hard days work the top of the window, moderate days the bottom. The window shifts daily with sleep, life stress, exams/work, etc. Schedule "go to the well" sessions only when the athlete is well rested physically and psychologically. Zone/RPE naturally adjusts to the day's window — the same zone may produce slower output on a bad day, and that's fine.

### Step 5 — How often do we need to go there?
- **Quick to gain = quick to lose.** Neural qualities (sprints, lifting, power) need more frequent exposure.
- **Different hierarchies:** aerobic work is frequency → volume → intensity; strength work is **intensity → volume → frequency**. A strength set that isn't hard enough to create adaptation doesn't become productive by doing it more often (see `06-strength-principles.md`).
- **Building:** repeat a stimulus roughly every **7–14 days (avg ~10)**.
- **Maintaining:** roughly every **14+ days**.
- This spacing is what creates room for other session types. Example: in a base phase, short reps at mile-race effort every 2 weeks surrounded by aerobic and pure speed work; in a specific phase, hard race-effort repeats weekly with a high-end aerobic session only every 2 weeks.

## 6. Rules for Claude when generating sessions

1. Prescribe intensity as **Zone + RPE** (`00-training-zones.md`). Never put fixed paces, splits, watts or loads in a generic session. Use the session types in `00` (recovery, steady, long, progression, aerobic threshold, lactate threshold, critical velocity, VO2max, speed endurance, sprint intervals) as the building blocks.
2. State the **purpose / pillar** of every session and whether it is **build** or **maintain**.
3. Base the prescription on the athlete's **norm** (recent logs). If no history, start conservatively and label the session as a benchmark.
4. Progress by **one manipulator at a time**, and label it *extend* or *qualify* against the previous similar session.
5. Keep most sessions in the **just-manageable** zone; schedule at most an occasional **"go to the well"** session, followed by cementing sessions, and only in a fresh week.
6. Space repeats of the same stimulus per Step 5 (build ~10 days, maintain ~14+ days; neural qualities more often).
7. Save **surges** and **feedback constraints** mainly for the specific/race phase.
8. Add one new stimulus at a time to the week (e.g. going from 1 to 2 interval sessions); new additions are written as optional "if you have time".
9. When readiness is low (sleep, stress, HRV), shift the window left: reduce the shift, keep the session type.
