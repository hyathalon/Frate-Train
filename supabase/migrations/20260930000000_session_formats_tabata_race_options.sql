-- Migration 4: session formats with timing rules, classic Tabata, race format
-- options, effort per call type, progression/deload settings, and server-side
-- athlete edits.
--
-- A session is warm-up + 1–3 parts + cool-down. Each part has a format; its
-- timing always comes from plan_format(), which reads session_formats.rules.
-- Timed formats are dosed by time only; rep formats by reps; strength by
-- sets × reps + load; plyometrics by foot contacts. Risk rules apply to every
-- format (the Edge Function filters candidates before any format rule).

-- ---------------------------------------------------------------------------
-- 1) Tabata-suitable exercises (coach-approved list). Low skill, low risk,
--    safe at maximal effort; no heavy or technical lifts. Risk and level
--    filters still apply on top, so Moderate-risk ergs reach Advanced only.
-- ---------------------------------------------------------------------------
alter table public.exercises add column tabata_suitable boolean not null default false;

update public.exercises set tabata_suitable = true where id in (
  -- burpees
  'EX0197', 'EX0409', 'EX0387', 'EX0408', 'EX0389',
  -- core
  'EX0392', 'EX0427', 'EX0430', 'EX0477', 'EX0205', 'EX0429', 'EX0431', 'EX0116',
  -- crawls
  'EX0206', 'EX0418', 'EX0390',
  -- legs
  'EX0130', 'EX0122', 'EX0021', 'EX0291', 'EX0023',
  -- med ball
  'EX0101', 'EX0199', 'EX0343',
  -- low-impact plyometric
  'EX0410', 'EX0013', 'EX0510',
  -- push
  'EX0175', 'EX0179', 'EX0419',
  -- ergs
  'EX0182', 'EX0165', 'EX0140'
);

-- ---------------------------------------------------------------------------
-- 2) Session formats and their rules (coach-editable).
--    Levels in rules are 'Beginner' / 'Intermediate' / 'Advanced'.
-- ---------------------------------------------------------------------------
create table public.session_formats (
  format text primary key,
  label text not null,
  dose_kind text not null check (dose_kind in ('time', 'reps', 'sets_reps_load', 'foot_contacts')),
  score text not null default 'none' check (score in ('none', 'rounds_reps', 'time')),
  needs_template boolean not null default false,
  running text not null default 'none' check (running in ('none', 'sim', 'capped')),
  rules jsonb not null,
  description text not null,
  updated_at timestamptz not null default now()
);

insert into public.session_formats (format, label, dose_kind, score, needs_template, running, rules, description) values
  ('Strength', 'Strength', 'sets_reps_load', 'none', true, 'none',
   '{"sets": 3, "work_s": 45, "change_s": 15, "pair_rest_s": 120}',
   'Supersets (A1/A2 …): sets × reps + load, 2 min rest after each pair.'),
  ('Circuit', 'Timed circuit', 'time', 'none', true, 'none',
   '{"work_s": {"Beginner": 30, "Intermediate": 40, "Advanced": 45}, "change_s": {"Beginner": 30, "Intermediate": 20, "Advanced": 15}, "round_rest_s": 120}',
   'Stations by time only: 30/30 beginner, 40/20 intermediate, 45/15 advanced; 2 min between rounds.'),
  ('Tabata', 'Tabata', 'time', 'none', false, 'none',
   '{"work_s": 20, "rest_s": 10, "rounds": 8, "blocks": [1, 4], "exercises_per_block": [1, 2], "block_rest_s": {"Beginner": 120, "Intermediate": 90, "Advanced": 60}}',
   'Classic Tabata: 20 s maximal work / 10 s complete rest × 8 rounds = 4 min per block; 1 exercise or 2 alternating; Tabata-suitable exercises only. Beginners: "hard but controlled".'),
  ('HIIT', 'HIIT intervals', 'time', 'none', false, 'none',
   '{"work_s": 30, "rest_to_work": {"Beginner": 2, "Intermediate": 1, "Advanced": 0.5}, "exercises": [1, 3]}',
   'Intervals on ergs or bodyweight: work:rest 1:2 beginner, 1:1 intermediate, 2:1 advanced; time plus pace or effort.'),
  ('AMRAP', 'AMRAP', 'reps', 'rounds_reps', false, 'none',
   '{"minutes": [8, 20], "exercises": [3, 5]}',
   'As many rounds as possible in a time cap (8–20 min), 3–5 exercises by reps; score rounds + reps.'),
  ('EMOM', 'EMOM', 'reps', 'none', false, 'none',
   '{"minutes": [10, 20], "exercises": [2, 4]}',
   'Every minute on the minute for 10–20 min, 2–4 exercises rotating, reps per minute.'),
  ('ForTime', 'For time', 'reps', 'time', false, 'none',
   '{"minutes": [5, 25], "exercises": [2, 5]}',
   'Fixed work by reps with a time cap; scored by time.'),
  ('Plyometric', 'Plyometrics', 'foot_contacts', 'none', false, 'none',
   '{"first_part": true, "drills": {"Beginner": [2, 5], "Intermediate": [2, 6], "Advanced": [2, 5]}, "contacts": {"Beginner": [60, 80], "Intermediate": [80, 120], "Advanced": [120, 140]}, "set_rest_s": {"Beginner": 60, "Intermediate": 75, "Advanced": 90}, "minutes": [6, 20]}',
   'Early in the session with full recovery; dosed in foot contacts per session: 60–80 beginner, 80–120 intermediate, 120–140 advanced.'),
  ('Mobility', 'Mobility', 'time', 'none', true, 'none',
   '{"work_s": 150, "change_s": 30}',
   'Mobility or recovery exercises one after another, by time.'),
  ('Aerobic', 'Steady aerobic (erg)', 'time', 'none', false, 'none',
   '{"minutes": [10, 60], "exercises": [1, 2]}',
   'Steady erg work (row, ski, bike) by time plus pace or effort, for the aerobic base without running.'),
  ('RaceSim', 'Race simulation', 'reps', 'time', false, 'sim',
   '{"minutes": [15, 90]}',
   'Full or partial race simulation following the race format: run segments at the race distance between stations; no cap on running.'),
  ('Compromised', 'Compromised', 'reps', 'none', false, 'capped',
   '{"minutes": [10, 60]}',
   'Short run segments paired with stations (e.g. 400 m run + station); running capped at compromised_run_share_max of the part.'),
  ('Station', 'Station work', 'reps', 'none', false, 'none',
   '{"minutes": [10, 60]}',
   'Race-station technique, standards and race-pace work; no running.');

alter table public.session_formats enable row level security;
create policy "session formats read" on public.session_formats for select to authenticated using (true);
create policy "session formats coach write" on public.session_formats for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Warm-up and cool-down for a whole session (same rule as plan_session).
create or replace function public.plan_session_frame(p_minutes int)
returns table (warmup_min int, cooldown_min int)
language sql immutable as $$
  select case when p_minutes <= 20 then 5 when p_minutes <= 30 then 7 else 10 end,
         case when p_minutes <= 20 then 2 when p_minutes <= 30 then 3 else 5 end
$$;

-- Timing and limits for one part of a session. p_minutes is the part's own
-- length (excluding the session warm-up and cool-down).
create or replace function public.plan_format(p_format text, p_minutes int, p_level text default 'Beginner')
returns jsonb
language plpgsql stable set search_path = public as $$
declare
  f public.session_formats;
  r jsonb;
  lv text := case when p_level in ('Beginner', 'Intermediate', 'Advanced') then p_level else 'Beginner' end;
  wk int; ch int; rest int; rounds int; n int; per numeric; blocks int; ratio numeric; run_cap numeric;
begin
  select * into f from public.session_formats where format = p_format;
  if not found then raise exception 'Unknown format %', p_format; end if;
  r := f.rules;
  select value into run_cap from public.app_settings where key = 'compromised_run_share_max';

  case p_format
    when 'Strength' then
      wk := (r->>'work_s')::int; ch := (r->>'change_s')::int; rest := (r->>'pair_rest_s')::int;
      per := (r->>'sets')::int * (2 * wk + ch) / 60.0 + ((r->>'sets')::int - 1) * rest / 60.0 + 1;
      n := greatest(1, floor(p_minutes / per + 0.15)::int);
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'exercise_count', n * 2, 'sets', (r->>'sets')::int,
        'work_seconds', wk, 'change_seconds', ch, 'rest_seconds', rest,
        'structure', format('%s supersets (A1/A2 …), %s sets each, 2 min rest after each pair', n, (r->>'sets')::int));
    when 'Circuit' then
      wk := (r->'work_s'->>lv)::int; ch := (r->'change_s'->>lv)::int; rest := (r->>'round_rest_s')::int;
      rounds := case when p_minutes <= 30 then 3 else 4 end;
      n := greatest(3, least(10, floor(((p_minutes + rest / 60.0) / rounds - rest / 60.0) / ((wk + ch) / 60.0))::int));
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'exercise_count', n, 'rounds', rounds,
        'work_seconds', wk, 'change_seconds', ch, 'rest_seconds', rest,
        'structure', format('%s exercises × %s rounds, %s s work / %s s change-over, 2 min between rounds', n, rounds, wk, ch));
    when 'Tabata' then
      rest := (r->'block_rest_s'->>lv)::int;
      blocks := greatest(1, least((r->'blocks'->>1)::int, floor((p_minutes * 60 + rest) / (240.0 + rest))::int));
      return jsonb_build_object('format', p_format, 'minutes', round(blocks * 4 + (blocks - 1) * rest / 60.0, 1),
        'blocks', blocks, 'rounds', (r->>'rounds')::int, 'work_seconds', (r->>'work_s')::int, 'rest_seconds', (r->>'rest_s')::int,
        'block_rest_seconds', rest, 'exercises_per_block', r->'exercises_per_block',
        'structure', format('%s Tabata block(s): 20 s work / 10 s rest × 8 rounds (4 min each), %s s between blocks', blocks, rest));
    when 'HIIT' then
      wk := (r->>'work_s')::int; ratio := (r->'rest_to_work'->>lv)::numeric; rest := round(wk * ratio)::int;
      rounds := greatest(1, floor(p_minutes * 60.0 / (wk + rest))::int);
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'rounds', rounds, 'work_seconds', wk, 'rest_seconds', rest,
        'exercises', r->'exercises',
        'structure', format('%s rounds: %s s work / %s s rest', rounds, wk, rest));
    when 'Plyometric' then
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'drills', r->'drills'->lv, 'contacts', r->'contacts'->lv,
        'rest_seconds', (r->'set_rest_s'->>lv)::int, 'first_part', true,
        'structure', format('%s–%s foot contacts, full recovery (%s s between sets)', r->'contacts'->lv->>0, r->'contacts'->lv->>1, r->'set_rest_s'->>lv));
    when 'Mobility' then
      n := greatest(4, floor(p_minutes / 3.0)::int);
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'exercise_count', n,
        'work_seconds', (r->>'work_s')::int, 'change_seconds', (r->>'change_s')::int,
        'structure', format('%s mobility or recovery exercises, one after another', n));
    when 'EMOM' then
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'rounds', p_minutes, 'exercises', r->'exercises',
        'structure', format('EMOM %s min, exercises rotating each minute', p_minutes));
    when 'AMRAP' then
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'time_cap_min', p_minutes, 'exercises', r->'exercises',
        'structure', format('AMRAP %s min; score rounds + reps', p_minutes));
    when 'ForTime' then
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'time_cap_min', p_minutes, 'exercises', r->'exercises',
        'structure', format('For time, %s min cap; score time', p_minutes));
    when 'Compromised' then
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'run_share_max', run_cap,
        'structure', format('Compromised work; running at most %s%% of the time', round(run_cap * 100)));
    else
      return jsonb_build_object('format', p_format, 'minutes', p_minutes, 'structure', f.description);
  end case;
end $$;

grant execute on function public.plan_format(text, int, text) to authenticated;
grant execute on function public.plan_session_frame(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Race format options for the Program Builder picker, with the run
--    distance between stations used by race simulations (null = no fixed
--    run distance for that format).
-- ---------------------------------------------------------------------------
create table public.race_format_options (
  id text primary key,
  race_code text not null references public.races(code),
  format text not null,                 -- matches race_formats.format
  label text not null,
  run_distance_m int,
  sort_order int not null,
  is_default boolean not null default false
);
create unique index race_format_options_one_default on public.race_format_options(is_default) where is_default;

insert into public.race_format_options (id, race_code, format, label, run_distance_m, sort_order, is_default) values
  ('hyrox-open', 'H', 'Open', 'Hyrox Open', 1000, 1, true),
  ('paladin-warrior', 'P', 'Warrior', 'Paladin Warrior', 800, 2, false),
  ('paladin-endurance', 'P', 'Endurance', 'Paladin Endurance', null, 3, false),
  ('deadly-dozen-track', 'DD', 'Track', 'Deadly Dozen Track', 400, 4, false),
  ('deadly-dozen-gym', 'DD', 'Gym (Strong / ERG / Air Bike)', 'Deadly Dozen Gym', null, 5, false),
  ('deka-fit', 'DEKA', 'FIT', 'DEKA FIT', 500, 6, false),
  ('deka-mile-strong', 'DEKA', 'MILE / STRONG', 'DEKA MILE / STRONG', null, 7, false);

alter table public.race_format_options enable row level security;
create policy "race format options read" on public.race_format_options for select to authenticated using (true);
create policy "race format options coach write" on public.race_format_options for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------------------------------------------------------------------------
-- 4) Effort per call type: members get more thorough blocks. Outline
--    previews (Haiku) take no effort setting. A repair after a high-effort
--    call runs at medium to stay within the Edge Function time limit.
-- ---------------------------------------------------------------------------
alter table public.ai_call_models
  add column effort_member text check (effort_member in ('low', 'medium', 'high')),
  add column effort_other text check (effort_other in ('low', 'medium', 'high'));

update public.ai_call_models set effort_member = 'high', effort_other = 'medium'
 where call_type in ('confirmation_block', 'next_block', 'hold_block', 'replan');

-- ---------------------------------------------------------------------------
-- 5) Settings for running share, session length and progression.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('compromised_run_share_max', 0.25, 'Compromised parts: running at most this share of the part''s time'),
  ('session_minutes_tolerance', 5, 'Sessions must fit the athlete''s minutes per session within ± this many minutes'),
  ('deload_volume_min', 0.6, 'Deload week core minutes: at least this share of the previous week (checked with 0.05 leeway)'),
  ('deload_volume_max', 0.7, 'Deload week core minutes: at most this share of the previous week (checked with 0.05 leeway)'),
  ('deload_session_minutes_min_ratio', 0.5, 'In deload weeks a session may be as short as this share of the usual minutes');

-- ---------------------------------------------------------------------------
-- 6) Athlete exercise edits go through the Edge Function (which checks the
--    session format, slot and the athlete's level); no direct writes.
-- ---------------------------------------------------------------------------
drop policy "edits own insert" on public.session_exercise_edits;
drop policy "edits own reset" on public.session_exercise_edits;
