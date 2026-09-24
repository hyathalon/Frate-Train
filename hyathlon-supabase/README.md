# Hyathlon Exercise Library for Supabase

This package moves the Hyathlon Exercise Database into Supabase so the app's workout builder picks from a tagged library instead of generating exercises freely. It also adds a flow for athletes to create their own exercises, with popular ones going to a coach for review.

Built Sep 2026 from `Hyathlon-Exercise-Database.xlsx`. It was tested on Postgres 16 with pg_trgm, using an auth mock that matches Supabase's.

## What's in the package

```
supabase/
  migrations/20260924000000_hyathlon_exercise_library.sql   schema, functions, views, row-level security
  seed.sql                                                   all library data (one transaction)
data/                                                        the same data as CSVs, for inspection or import
docs/AI_WORKOUT_BUILDER_RULES.md                             rules for the AI side of the workout builder
Hyathlon-Exercise-Database.xlsx                              the source workbook
```

## Install

**With the Supabase CLI** (recommended):

1. Copy `supabase/migrations/…sql` into the project's `supabase/migrations/` folder.
2. Append `supabase/seed.sql` to the project's seed, or run it once: `psql "$DATABASE_URL" -f supabase/seed.sql`.
3. `supabase db push` (remote) or `supabase db reset` (local; runs migrations and the seed).
4. Regenerate types: `supabase gen types typescript --linked > src/types/database.ts`.
5. Add each coach account: `insert into public.coaches (user_id) values ('<auth user id>');`

**Without the CLI:** paste the migration into the SQL editor and run it, then do the same with `seed.sql`.

If the project already has tables with any of these names (`exercises`, `stations` …), rename them in the migration before running it.

## Data model

| Table | Rows | Purpose |
|---|---|---|
| `exercises` | 445 | One row per unique exercise, with a clean name and no dose. Tags: `movement_pattern`, `equipment`, `equipment_options`, `primary_pillar`, `secondary_pillar`, `where_setting`, `best_with`. `media_url` is for the GIF. |
| `exercise_aliases` | 182 | Other names for the same exercise ("KB DL", "RDL", "Wallballs"). Used by search. |
| `stations` | 24 | Race stations, grouped by movement. |
| `station_races` | 52 | Which races use each station, and that race's standard. |
| `station_prescriptions` | 1,287 | Foundation and Development rows: station + level + exercise + **dose**. `primary_pillar`, `load` (Low/Moderate/High), `where_setting` and `best_with` are set per row, because the same exercise can serve a different purpose at a different dose. |
| `race_sessions` | 495 | Specific-level race prescriptions: session, dose, `session_type`, pillars, load, where, best with, `courage`. |
| `races`, `race_formats` | 4 / 64 | Hyrox, Paladin, Deadly Dozen and DEKA, with the station order for each format. |
| `custom_exercises` | — | Exercises athletes create themselves. Private to the athlete until a coach reviews them. |
| `exercise_usage` | — | One row each time an athlete uses an exercise, from the library or a custom one. |
| `app_settings` | 2 | Promotion thresholds (default: 5 athletes within 30 days). |
| `coaches` | — | Users who can edit the library and review custom exercises. |

**Views**
- `v_station_library`: everything for a station in one query: exercises with doses plus race sessions, with all tags and the GIF.
- `v_promotion_candidates`: custom exercise names used by enough different athletes to be reviewed, with the closest existing library match.

**Functions**
- `search_exercises(q, max_results)`: fuzzy search across names and aliases. Use it for type-ahead.
- `promote_custom_exercise(...)`: coach only. Creates a new library exercise and moves the matching custom rows and their usage onto it.
- `merge_custom_exercise(custom_id, exercise_id)`: coach only. The custom exercise is really an existing one; its usage is moved across and its name saved as an alias.
- `reject_custom_exercise(custom_id)`: coach only.

## Tag vocabulary

- **Pillars (rows):** Aerobic Engine, Threshold, Durability, Economy, Balanced Athleticism, Fatigue Management.
- **Connection & Courage** is not a row pillar:
  - Connection is recorded as `where_setting` (Home or gym / Gym / Outdoor or track) and `best_with` (Solo OK / Group-friendly / Partner or group / Group / Coach helpful / Coach or partner).
  - Courage is recorded as `race_sessions.courage` (Test / Race rehearsal / Overload / Finish surge).
  - Streaks, consistency and first-race decisions belong at program or athlete level.
- **Training Principles** governs how rows are combined. It isn't tagged on rows.
- **Load** doubles as recovery cost.

The full definitions are in the workbook's Pillar Guide sheet.

## Workout builder: database first

1. Filter candidates from `v_station_library` (or the base tables) by station, level, pillar, load, equipment and `where_setting`.
2. Pass only those candidate rows (id, name, dose, tags) to the AI. The AI chooses and orders them and can adjust doses, but must return library IDs. See `docs/AI_WORKOUT_BUILDER_RULES.md`.
3. Validate the AI's output server-side: every `exercise_id` must exist in `exercises` and every `session_id` in `race_sessions`. Reject or repair anything else.
4. If the AI reports a gap (nothing in the library fits), show it to a coach. Don't invent an exercise.

```ts
// candidates for a home Foundation session on wall balls
const { data } = await supabase
  .from('v_station_library')
  .select('*')
  .eq('station_id', 'wb')
  .eq('level', 'Foundation')
  .eq('where_setting', 'Home or gym');

// pillar balance for a planned week: count rows by pillar/load in the app
```

## Athlete-built workouts and custom exercises

1. **Search first.** As the athlete types, call `supabase.rpc('search_exercises', { q, max_results: 8 })` and show the matches. Picking one stores a library `exercise_id`.
2. **Create if missing.** If nothing fits, insert into `custom_exercises` (`name`, optional `equipment`, `movement_pattern`, `notes`). It's private to that athlete. Athletes never set pillars or load.
3. **Log usage.** Every time an exercise is used in a workout, insert into `exercise_usage` with either `exercise_id` or `custom_exercise_id`, plus `workout_ref` (the id in your existing workout tables).
4. **Review list.** Coaches read `v_promotion_candidates`, which shows names used by at least `promotion_min_athletes` different athletes within `promotion_window_days`. Name matching ignores case and spacing.
5. **Coach decision** (build a small admin screen):
   - Approve → `rpc('promote_custom_exercise', {...tags})`, then add `station_prescriptions` rows to place it in stations.
   - Merge → `rpc('merge_custom_exercise', { p_custom_id, p_exercise_id })`.
   - Reject → `rpc('reject_custom_exercise', { p_custom_id })`.
   All three act on every pending custom row with the same normalised name, and move usage to the library exercise so athletes' history stays intact.

## Security (RLS)

- Library tables: any signed-in user can read; only coaches can write.
- `custom_exercises`: athletes can read and edit their own rows while they're private; coaches can read and review all of them.
- `exercise_usage`: athletes can insert and read their own rows (and only against their own custom exercises); coaches can read all of them.
- The review functions check `is_coach()`.

## Editing the library

From now on, edit in Supabase: in the table editor, or through an admin screen. The workbook is kept for reference. If you add exercises directly, use the next `EX####` id, add a row in `station_prescriptions` for each station and level, and add aliases for common nicknames.
