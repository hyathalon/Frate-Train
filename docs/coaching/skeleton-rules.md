# Skeleton Rules — what the code decides before the AI writes anything

**Purpose:** The program generator is being split in two. **Code** builds the *skeleton*: every week's days, AM/PM order, slot types, counts and minutes, from the rules below. **Claude** then fills each slot: exercises, doses, cues, titles, notes and the week's wording. The validator stays as a safety net. *Approved by the coach, 2 Oct 2026 (with changes).*

**Rule order** (from `product-tiers-and-safety.md` §3): Safety > Structure > Coaching > Personalisation > Presentation. When two rules below clash, the higher one wins.

---

## 1. Season skeleton (once per program, from the race dates)
- **Weeks** run Mon–Sun. **Mid-week lead-in:** the program starts on the sign-up day; the days up to Sunday are an easy lead-in (absorption/easy runs or rest; no quality, no long run with efforts). Program week 1 is the next Monday.
- **A race (goal event):** the season is built backwards from it: taper, then specific, build, base (shorter programs drop base, then build).
- **Taper (Hyathlon, scales with volume):**
  - **Low volume** (3 or fewer runs a week): ~7 days. Race week only; frequency and intensity kept, session types change (shorter efforts); last long run (with efforts) ~6 days out.
  - **Higher volume** (4+ runs a week): 8–14 days. Race week + the week before; volume down 40–60%.
  - Marathon / half marathon (later): by program length (marathon 12+ weeks → 3 weeks; 6–11 → 2; up to 5 → race week + 1. Half: under 8 weeks → race week; 8+ → 2 weeks).
- **Deload (by weekly running time):** more than 5 h of running a week → every 4th week is a deload (3 up, 1 down; ~60–70% volume), never inside the taper. Up to 5 h a week (typically 3–4 runs) → no fixed deload; volume keeps building, and a race week, C-race week or low-readiness week acts as the lighter week.
- **Two A races:** each gets its own taper and race recovery; the weeks between follow the same build → specific order, shortened.
- **B race:** 3–5 lighter days before it (volume down ~20–30%), one short sharpener, no long run that week; recovery by event type.
- **C race:** train through it. It replaces that day's key or long session and counts in load. Treated as **raced hard** (full recovery by event and level) unless the athlete marks it "controlled / training run". Before it: advanced athletes with no niggles get at most one lighter day; beginners, intermediates or anyone with a current or recent niggle get a rest day + a short shakeout. A B or C race in the last 10–14 days before an A Hyathlon race gets a "controlled effort" note.
- **Race recovery (after any A/B race, and a hard C):** no intensity for 48–72 h. Hyathlon or half marathon: quality from day 4–7. Marathon: 3 weeks of easy running and off-feet only. 10 km or shorter: advanced athletes without a niggle go straight back; beginners, intermediates or anyone with a current or recent niggle get no quality session the week after (easy runs and the long run only). Two or more races at one event: ~10 days before quality.
- **Progression lever per week:** start, then volume / intensity / frequency in turn; "deload" for deload and taper weeks. Frequency is only used if a free day exists.

## 2. Days in a week
- **Training days:** the athlete's days (onboarding suggestion: spread evenly, always including the preferred long-run day).
- **No-running days** (`no_run_days`, onboarding: "E.g. your gym class mornings"): runs never go there; their classes or strength can.
- **Long-run day:** the preferred long-run day if it's a running day; otherwise the last weekend training day; otherwise the last running day of the week.
- **Key day:** the preferred key day if it's a running day; otherwise the middle running day; never the long-run day or the day before it (moved one running day earlier).
- **HARD RULE: no two interval (quality) sessions on back-to-back days,** including Sunday → Monday across weeks. Interval = key run, second quality run, compromised, race simulation, HIIT/Tabata. The long run with efforts counts as quality. The athlete's own classes don't count as interval sessions for this rule.

## 3. Slots and counts per week
| Slot | How many | Where |
|---|---|---|
| **Key session** | 1 | Key day. Running programs: the main interval run (RPE 8+), from the first interval week (before it: the main aerobic run; 30 s efforts first). No-running: hard strength (may stand alone), off-feet intervals at RPE 8+, a race simulation or a hard AMRAP/EMOM. |
| **Long run** | 1 (none in race week) | Long-run day. Minutes from the long-run stages (bands 50–60 → 60–70 → 70–80, then LR 1–7b; LR 5+ advanced only). Efforts only from about the 4th long run of the program, and only for well-conditioned athletes (never beginners). |
| **Second quality run** | 0–1 | Only with 4+ runs a week, intermediate/advanced, build/specific phase; ≥1 non-interval day from the key session and the long run with efforts. |
| **Compromised / hybrid** | 1 a week from the build phase; entry-level sessions for athletes with 0–2 Hyathlon races | A running day that isn't next to another interval day. Counts as quality. If the athlete's own classes include a Hyathlon-style/compromised class, that class counts as it (no extra session). |
| **Race simulation** | per `race_sims` | *plan_for_me:* full sim every 3–4 weeks (specific phase; any phase for no-running), replacing that week's key session. *my_plan:* the athlete's type and frequency, as the key session. *none:* never. Always an easy day after; none in race week (last one 7–10+ days before the A race). |
| **Easy / absorption runs** | the rest of the runs | Remaining running days; the day after the long run is easy or rest. |
| **Strength** | `strength_sessions_pref` (default 2; 3 if strength endurance is a limiter); deload 1 + 1 optional; taper 1; race week 1 short ≥5 days out | See §4. |
| **Station skill** | add-on only | ≤10 min inside a strength day; never a day's only session. |
| **Runs per week** | from the athlete's current runs (Q4), +1 at most per block | Beginners: 3 (main, absorption, long) + 1 cross-training; never 3 training days in a row. |

## 4. Strength placement
1. **With hard sessions (default):** the PM session (order 2) after a quality run or hybrid session, ≥6 h apart where possible. With `can_double` = no it goes straight after the run, still its own session.
2. **Own days:** a hard day; not the day after a key session; followed by an easy or rest day.
3. **More strength sessions than hard days (4–6):** extras on own days first, then easy days — **upper body/core first**, with a short recovery-cost note. Never on a recovery day.
4. **Interference:** heavy lower-body / lunge / sled work is never the day before a key run or long run, nor a PM session two days before. The code marks each strength slot **lower, upper+core or full**; slots near a key or long run are upper+core.
5. **Own classes** (`strength_choice = own`): fixed sessions on their days (hard unless marked easy); they count as hard days; no programmed strength. **coach_run:** gets the AI strength program (no coach feedback on strength).
6. **Second-of-day strength** uses the 30/45-min templates.

## 5. Minutes
- Two sessions in a day: at least 6 h apart where possible ("at least 6 h after your run").
- Easy and absorption runs use the athlete's session time (walk–run beginners can be shorter, per the `07` templates).
- Every session is the athlete's minutes per session (±5), except: second-of-day strength (30/45-min template), long runs (stage minutes), deload sessions (down to half), taper (scaled), lead-in and race-week sessions (short).

## 6. No-running athletes
Off-feet only: no runs anywhere. Erg and bike sessions only if chosen (Q2c); race simulations only if chosen, with run segments swapped for their preferred erg or bike. The home-beginner weekly shape (key + 2 strength; other days rest or an easy walk + mobility) is a fixed skeleton.

## 7. Weekly check-in rewrite (same skeleton)
- **Train as planned:** no change.
- **Go a bit easier:** same slots; lower end of ranges; key session shortened.
- **Avoid running (off-feet):** every run slot becomes the same purpose off-feet (preferred modality).
- **Rest:** the week's slots become rest or optional easy sessions; the next key session stays.
- **App tiers** use `week_choice` (the four options above). **All tiers:** low readiness (fresh / energy / sleep) → the deload shape for that week.
- **Coaching tiers also:** a body report 3/10 or less = wait and watch (no change); 4/10+ or Pain = affected sessions fully off-feet, same purpose.
- **Less availability:** keep the key session and long run; drop optional, then easy, then extra strength.

## 8. When a block still fails
After the repairs, the skeleton is **filled from stored template sessions** (no AI) so the athlete always gets a week, and the coach is flagged (coaching tiers).

## 9. What Claude still decides
Exercises and doses within each slot, progression of one lever per quality session, cues, titles, notes, alternatives, the season summary and weekly focus lines.

## 10. Validator checks that change with the skeleton (approved)
1. The week's main aerobic run (before intervals start) counts as a hard day, so strength can follow it.
2. "A frequency week must add a session" only applies when a free day exists.
3. Taper volume follows the taper scaling (low-volume athletes aren't checked against a 40–60% cut).
4. Session counts include the athlete's own classes and second sessions of the day.
5. With 4–6 strength sessions, extras on easy days are allowed (upper body/core first); never on recovery days.

---
**Decided (coach, 2 Oct 2026):** template-week fallback; `no_run_days`; runs per week from current runs, +1 per block at most; a second quality run only at 4+ runs a week and intermediate/advanced; one compromised session a week from the build phase (an own Hyathlon-style class counts); C races raced hard unless marked controlled.
