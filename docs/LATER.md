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
- **Race analysis:** splits vs expected, spotting going out too hard and fading.
