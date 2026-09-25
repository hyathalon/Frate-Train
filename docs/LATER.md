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
- **Pain/injury question in check-ins,** with a consent step. Waits for the privacy checklist. `program_checkins` will have unused `health` fields ready for it.

## Training data

- **Workout logging**, then: check-ins pre-filled from logs, exact adherence, streaks (core sessions only; optional sessions are a bonus and never break a streak), and the Pillars screen (`workout_logs`).
- **Rest timer** (part of workout logging):
  - Pops up after a set is logged, preset to the programmed rest. There is also a Rest button on the workout screen.
  - Beeps and vibrates at the end (switchable), with an optional 10-second warning, and sends a notification if the phone is locked.
  - After each rest it resets to the last rest used and waits for the next press. +/−15 s adjustments are remembered.
- **Interval timer** for timed formats (Tabata, circuit, EMOM, HIIT): work and rest beeps and a round count.
- **Race analysis:** splits vs expected, spotting going out too hard and fading.
- **Runs outside the program:** ask "How many runs do you do per week outside this program?" and use it to balance leg load (Fatigue Management). The program itself has no standalone running sessions.
