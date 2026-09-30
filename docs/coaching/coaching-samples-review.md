# Coaching Samples Review — What Real Programs Show vs the App Rules

**Purpose:** Frates shared eight real athlete programs and intake forms (athletes A–H, anonymised here). This doc compares how he actually coaches with the app rules, and lists changes to consider. No personal or health details are stored here.

Status key: ✅ decided · ❓ needs a decision · 💡 suggestion

---

## Decisions (30 Sep 2026)
- **3.1** ✅ Experienced athletes can take more than one new stimulus.
- **3.2, 3.7, 4.5** ✅ Injury history, return to run and menstrual cycle tracking are **member-only features behind a consent step**.
- **3.3** ✅ Race recovery depends on the event: marathon or longer 3 weeks before quality run sessions; 10 km or shorter next week. Half marathon and Hyathlon race still to confirm. After an event, ask the athlete what they want training to look like.
- **3.4** ✅ Athletes can add events any time after onboarding.
- **3.5** ❌ Elevation dropped (only useful if the data uploads).
- **3.6** ✅ Coach can set restrictions and a goal focus (members).
- **4.1** ✅ Athletes can add their own strength/classes by title, with optional exercises and sets.
- **4.2** ✅ Hyathlon race average run pace added to Q6.
- **4.3** ✅ Events asked at onboarding, but the program runs with no events in the next 3 months.
- **4.4** ✅ Travel changes equipment and availability; bodyweight maintenance when there's no equipment.
- **5.1–5.9** ✅ All in. Weekly focus and block banner are combined (pillar-based for self-serve, coach note for members). Emoji feel feeds the load graph.
- **5.7** ✅ CrossFit added as a training method, with its exercises in the database.

All written into `onboarding-and-check-in.md` (§1, §2, §5, §11–§14), `04`, `03`, `06` and `system-prompt.md`.

## 1. Already matches the app ✅
- Easy/aerobic runs, split threshold (e.g. 3×7 min, 5×4 min at race-average effort with short jog recovery), hill sprints (8×10 s, walk-back), hilly long runs, compromised runs, race simulations.
- Optional extra run: "3 runs is fine for maintenance, 4 gives a little more aerobic support".
- Long runs mostly 75–90 min, building to a regular 90 min (90–120 min for experienced runners).
- Flexibility and moving sessions: athletes regularly do a session the next day. Matches "the app recommends, the athlete decides".
- Keeping group sessions (run club, monthly social run): matches "lock a session" and the Connection pillar.
- Cautious start for injury-prone athletes: see §3.

## 2. RPE scale ✅ decided
Real sessions describe easy long runs as "RPE 2–3/10" and race pace as "RPE 6–7". **Decision: the app keeps its own scale** (Recovery 1–4, Easy 5–6, Steady 6–8, Mod. Hard 8–8.5, Hard 8.5–9.5, Very Hard 9.5–10). Frates will write his own sessions to match over time.

The calendars back this up: what athletes **log** already matches the app scale. Recovery runs are logged about 3 (Light), long runs about 6 (Moderate) and split threshold about 8 (Hard).

## 3. New coaching rules to add

| # | Rule seen in the samples | Status |
|---|---|---|
| 3.1 | **Progression confidence scales with experience.** One new stimulus at a time is the default, but experienced, consistent, injury-free athletes (e.g. 10+ years) can take two at once (e.g. an extra run and a new interval session). New or recently injured athletes, or those new to intervals or strength, stay at one. | ❓ |
| 3.2 | **Injury-prone start.** Athletes with a recent calf, Achilles or bone-stress history start with no hills and nothing faster than 5 km–15 km effort (Z3–low Z4). Hills, VO2max and speed come back once the first block is handled well. | ❓ (uses injury history = health data, decision B) |
| 3.3 | **Post-race recovery.** An athlete can't go straight into a full program after a race. Onboarding asks when their last race was; the first week(s) after a race are recovery/maintenance before building. | ❓ |
| 3.4 | **Other events during the program.** Besides the main event, athletes enter other events (10 km, half marathon, extra Hyathlon races). They add them to the calendar and the plan adapts: not every event needs a taper, but the days before and after need considering. | ❓ |
| 3.5 | **Weekly elevation.** For running strength, aim for roughly 7–10 m climb per km across the week (hilly long runs etc.), unless hills are held back for injury (3.2). | 💡 |
| 3.7 | **Return to run after a longer injury** (e.g. bone stress): a walk–run progression (Walk Run 1, 2, 3…), a short easy test run before running normally, and off-feet bike/erg sessions (tempo, high-cadence speed, long ride) keeping fitness meanwhile. Longer than the 2-week niggle build-back; progression on medical guidance, considerations only. | ❓ (health data, decision B) |
| 3.6 | **Coach/strength-coach restrictions.** E.g. a strength coach asks for no hill sprints, or no running during a hypertrophy block. The coach (or athlete) can set blocked session types that the generator respects. | ❓ |

## 4. Onboarding gaps

| # | Gap | Status |
|---|---|---|
| 4.1 | **"I already have a strength / classes program."** Most athletes already do F45, CrossFit, a class program or have their own strength coach, 2–5× a week. Mirror the running choice: *Program my strength* · *I already have strength or classes (which days, hard or easy)* · *No strength*. External sessions count in load and runs are placed around them. | ❓ |
| 4.2 | **Last Hyathlon race result, including average run pace.** Every intake uses it, and it's the best anchor for the athlete's own zone values. Add it to Q6 (recent result). | 💡 |
| 4.3 | **Last race date** (for 3.3) and **other events this year** (for 3.4). | ❓ |
| 4.4 | **Travel.** Some athletes travel often (hotel gym, treadmill only). A "travelling this week" option in the check-in that switches equipment to what's available. | 💡 |
| 4.5 | **Menstrual cycle tracking** (the coach adapts training around it for some athletes). Health data: only with the privacy checklist and consent step. | ❓ later |

## 5. App features the samples point to

| # | Feature | Status |
|---|---|---|
| 5.1 | **"Why this session" text.** Every real session has *Focus* and *Purpose* (the physiological benefits), and athletes like knowing why. Show a short purpose line on every session. | 💡 |
| 5.2 | **Weekly focus note** at the top of each week ("Focus this week is building in another quality run…"). Coach-written for members; generated for self-serve athletes. | 💡 |
| 5.3 | **Athlete feel + comment per session**: an emoji feel (Great / Good / Poor…), a 1–10 effort with a word (Light / Moderate / Hard) and an optional comment. The coach finds these the most useful thing to see. Add to the session log. | 💡 |
| 5.4 | **Matching uploads to planned sessions.** Watch uploads often land outside the planned session (shown grey), warm-ups and each interval can upload separately, and sessions are often done a day late. Logging needs to match or merge uploads to the planned session, and credit a session done a day late. | 💡 |
| 5.5 | **Coach can plan ahead with hidden sessions** that the athlete sees later. | 💡 (members) |
| 5.6 | **Weekly totals by type** (run, bike, swim, strength minutes). | 💡 |
| 5.8 | **Block banner:** a label across a run of weeks (e.g. "Maintenance during 3 weeks of strength focus") so the athlete sees the phase at a glance. | 💡 |
| 5.9 | **Planned vs completed totals** per week by type (the right-hand column in the calendar). | 💡 |
| 5.7 | **CrossFit as a training method,** with CrossFit exercises in the database. | ❓ |
