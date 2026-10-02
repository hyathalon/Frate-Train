# Later

Agreed features and changes that are deliberately not built yet.

## Before real athletes use the app

- **Email provider** (custom SMTP). Needed for password-reset emails and for emailing coach alerts. Until then, passwords are reset in the Supabase dashboard.

## Accounts and settings

- **Owner-only settings once there is more than one coach.** Limits, prices and the spend-alert threshold in `app_settings` are currently editable by any coach. Restrict them to the owner.

## Payments

- **Payments** for the `app` tier and for purchased extras (a pack of extra confirmations). The data model is ready: `athletes.billing_*` and `athlete_credit_ledger`.

## Coaching

- **Coach–member messaging.** Members are linked to a coach through `athletes.coach_user_id`.
- **Soreness/niggle question in check-ins** (block and weekly), with a consent step. Waits for the privacy checklist. `program_checkins` and `weekly_checkins` have `health` fields, locked empty until then. The niggle rules (fully off-feet, then a 2-week build-back) are already in the system prompt.

## Training data

- **Workout logging**, then: check-ins pre-filled from logs, exact adherence, streaks (core sessions only; optional sessions are a bonus and never break a streak), and the Pillars screen (`workout_logs`).
- **Adaptive blocks from logged training:** later blocks progress from what was actually done (sets completed, session minutes, sessions per week), not only from check-in answers.
- **Coach's workout-design documents** in `hyathlon_reference` (optional), only if prompts stay fast. The condensed rules are already in the system prompt.
- **Rest timer** (part of workout logging):
  - Pops up after a set is logged, preset to the programmed rest. There is also a Rest button on the workout screen.
  - Beeps and vibrates at the end (switchable), with an optional 10-second warning, and sends a notification if the phone is locked.
  - After each rest it resets to the last rest used and waits for the next press. +/−15 s adjustments are remembered.
- **Interval timer** for timed formats (Tabata, circuit, EMOM, HIIT): work and rest beeps and a round count.
- **Race analysis:** splits vs expected, spotting going out too hard and fading.
- **Runs outside the program:** ask "How many runs do you do per week outside this program?" and use it to balance leg load (Fatigue Management). The program itself has no standalone running sessions.

## Plans and coaching (final pricing, 2 Oct 2026; plan types and credit rules are in the database, not yet the screens or payments)

- **Brand:** sold as Hyathlon (Hyathlon Performance / Hyathlon Coaching), with no links to Frate Train.
- **Payments** (AUD): app_monthly $75/month (cancel any time, paid to the end of the month, one reminder before each charge: pause or renew; a pause stops new plans, no refund of the current month); app_12wk $149 up front (no pause, no refund); coach_run $165/month; coach_hybrid $275/month. Re-plans: app_monthly 1 per 4 paid weeks (first after 4, no carry-over), app_12wk 3, extra $10, coaching unlimited. Billing keeps `athletes.plan`, `plan_started_at` and `paid_weeks` up to date.
- **Coach credits** ($30 each, half units): written reply 1, short video reply 2, extra video form checks 1 (up to 2 exercises), online Q&A call 3 (up to 20 min), running gait analysis 4.5 ($135: athlete uploads running video; coach sends findings and drills).
- **Coaching tiers:** both get a 30-min set-up consultation, written weekly coach review of flags and the week, the coach editor, flag review, health features with consent, unlimited re-plans, replies "within 24–48 hours". coach_run gets the AI strength program but no coach feedback or form checks on strength; coach_hybrid adds coach-reviewed strength and video form checks on up to 2 exercises a week. Seats: coach_hybrid 8–10 per coach, coach_run about 15; new members shared across coaches.
- **App-tier weekly check-in:** "train as planned / go a bit easier / avoid running (off-feet) / rest" instead of pain scores. No health data on app tiers; pre-exercise screening only. No human at sign-up.
- **App-tier chat and pain:** the AI never assesses pain. It says to stop, see a medical professional, choose "avoid running" or "rest", and offers a coach credit or a coaching tier.
- **Coach editor inside the app:** coaches program directly (no Final Surge import).
- **Return to run:** the app generates a return-to-run program from the `07` templates; a coach reviews it against the athlete's medical advice before release (coaching tiers, or a coach credit on app tiers).
- **Back-to-back interval sessions moved by the athlete:** a warning with a one-tap "Make it an aerobic run" (same duration, RPE 5–6, no efforts); the athlete can keep it (6.4/6.5).
- **Onboarding (6.3):** `no_run_days` (multi-select, optional; helper "E.g. your gym class mornings"); event form option "controlled / training run".
