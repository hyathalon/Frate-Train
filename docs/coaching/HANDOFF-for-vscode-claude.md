# Handoff: coaching rules update (paste this into the VS Code Claude session)

## Already done (by Claude on claude.ai)
`supabase/functions/<generate>/lib/prompts.ts` was updated by the coach:
- Added `SESSION_DESIGN_RULES`, appended to `systemPrompt()` as static text so the prompt cache still works. It covers:
  - RPE labels instead of zone names; RPE 1–4 only for recovery, warm-ups and cool-downs.
  - Magness session types.
  - One manipulator per session, extend/qualify.
  - Set and long-run ranges, and hill sprints placed by time.
  - Cross-training alternatives in `cue`.
  - Spacing and interference rules.
  - Niggle → fully off-feet, then a 2-week build-back.
- `ProgramInputs` has two new **optional** fields: `longest_run_min` and `cross_training_preferences`. `athleteFacts()` prints them, or "not specified" if missing.
- The run/erg dose example in `blockPrompt()` now uses RPE instead of pace.
- No schema changes. Everything fits the existing `dose` / `cue` strings.

## Before anything else
The code is mid-refactor and won't type-check yet:
- `schemas.ts` (modified) uses `Session.parts[]`.
- `validate.ts` and `program.ts` (`addTiming`) still use `s.method`, `s.duration_min`, `s.items`, `s.template_id`, and import `TEMPLATE_METHODS`, which `schemas.ts` no longer exports.

Finish that refactor first, run `deno check` and the tests, and only then deploy.

## Rule change since the prompt update
The niggle rule in `SESSION_DESIGN_RULES` (and `app/system-prompt.md`) has changed: a niggle or soreness rated **3/10 or less is wait and watch** (no change to the plan). Only **4/10 or more, or a Pain report**, moves affected running sessions fully off-feet. Update `prompts.ts` to match `app/system-prompt.md`.

Also changed: **zones and feel words.** Z1 = **Recovery**, RPE 1–4 (was "Easy, <5"). Z2 is split: **Easy RPE 5–6** (easy runs) and **Steady RPE 6–8** (long runs). Z3–Z5 unchanged. Athlete labels: "RPE 1–4 · Recovery", "RPE 5–6 · Easy", "RPE 6–8 · Steady". `app/session-schema.json` now includes "Recovery" in the `feel` enum; update `schemas.ts` to match. VO2max recovery is standing/stationary (pillar `aerobic_engine`). The `speed` session type now splits by rep length: 30 s or less → pillar `economy`; 30–90 s (speed endurance) → pillar `aerobic_engine`. The session-type list itself does not change.

## Next tasks (in order)
1. **Collect the onboarding inputs.** The final questions, answer options and field names are in **`app/onboarding-and-check-in.md` §1**. At minimum, update `parseInputs()` in `program.ts` to accept:
   - `longest_run_min`: optional integer, 0–300 (minutes, not km).
   - `cross_training_preferences`: optional ordered list from the equipment vocabulary, max 8.

   Then build the onboarding screens from §1 of that doc (the other fields are optional inputs too; pass them to `athleteFacts()` the same way).
2. **Weekly check-in.** Build it exactly as in **`app/onboarding-and-check-in.md` §2–§4**: three readiness sliders (0–10, 10 = good), body reports (Awareness / Soreness / Niggle / Pain, area, side, 0–10 rating, trend), availability change, optional note. Compute the readiness colour and apply the body-report and availability rules in §3 to regenerate or edit the coming week. Record the changes and keep optional sessions out of streak counts. Follow §4 for health-data storage.
3. **Session log, weekly adjustment and athlete control.** Build from `app/onboarding-and-check-in.md` §5–§7:
   - Session log fields: `session_rpe`, `completed`, `training_with`, `location`, `modification_reason`; unlogged sessions become missed.
   - End-of-week draft of next week with a "What changed and why" card and Accept / Keep original / Edit (adjusted week applies if no response).
   - Permissions: self-serve athletes can change anything; coached members can move, modify (with reason), add and lock sessions but can't delete key sessions; coach sees all edits.
   - Locked sessions and athlete-added sessions are passed to the generator; added sessions count in load.
4. **Pillar suggestions.** Implement §8 as plain app rules (no AI call): check the last 3 weeks of logs per pillar, max 2 optional suggestions a week, dismiss = hide for 2 weeks, no extra-load suggestions when readiness is red or a body report is 4/10+.
5. **Adaptive blocks:** make sure later blocks read what was actually completed (sets done, long-run minutes, sessions/week) and progress from that.
6. **Reference material (optional):** consider adding the coach's `workout-design` docs (including `05-training-methods.md`) to the `hyathlon_reference` table only if the prompt stays fast. The condensed rules are already in the system prompt.
7. Deploy the function and test with 5 athlete profiles: beginner, experienced, low availability, a calf niggle at 2/10 (wait and watch) and a calf niggle at 5/10 (off-feet).
