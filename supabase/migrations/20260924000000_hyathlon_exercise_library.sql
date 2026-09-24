-- Hyathlon Exercise Library
-- Supabase migration: library tables, athlete custom exercises, usage tracking,
-- type-ahead search, promotion review, and row-level security.
-- Generated Sep 2026 from the Hyathlon Exercise Database workbook.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Controlled vocabularies (check constraints keep values consistent)
-- ---------------------------------------------------------------------------
-- Pillars (Hyathlon System). Connection & Courage and Training Principles are
-- not row tags: C&C lives in where_setting / best_with / courage, and Training
-- Principles governs how rows are combined into programs.

create or replace function public.is_valid_pillar(p text) returns boolean
language sql immutable as $$
  select p is null or p in ('Aerobic Engine','Threshold','Durability','Economy','Balanced Athleticism','Fatigue Management')
$$;

-- ---------------------------------------------------------------------------
-- Coaches (who can edit the library and review athlete exercises)
-- ---------------------------------------------------------------------------
create table public.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coaches where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Races and stations
-- ---------------------------------------------------------------------------
create table public.races (
  code text primary key,                 -- H, P, DD, DEKA
  name text not null unique
);

create table public.race_formats (
  id bigint generated always as identity primary key,
  race_code text not null references public.races(code),
  format text not null,
  sort_order int not null,
  segment text not null
);

create table public.stations (
  id text primary key,                   -- e.g. 'kbdl'
  name text not null unique,
  group_name text not null check (group_name in ('Running & Ergs','Sleds & Carries','Lower Body','Upper Body & Olympic','Bodyweight & Core')),
  sort_order int not null
);

create table public.station_races (
  station_id text not null references public.stations(id) on delete cascade,
  race_code text not null references public.races(code),
  standard text,                         -- e.g. '60 reps · 32 / 24 kg'
  primary key (station_id, race_code, standard)
);

-- ---------------------------------------------------------------------------
-- Exercises (one row per unique exercise; no doses in names)
-- ---------------------------------------------------------------------------
create table public.exercises (
  id text primary key,                   -- EX0001 …
  name text not null,
  name_normalized text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  movement_pattern text not null check (movement_pattern in (
    'Running','Erg','Squat','Squat-to-press','Hinge','Lunge / single-leg','Upper push','Upper pull',
    'Olympic / power','Carry & grip','Core','Plyometric','Burpee','Crawl','Med ball / throw',
    'Mobility','Sled','Lower leg','Mixed couplet')),
  equipment text not null,               -- display label, e.g. 'Kettlebell or dumbbell'
  equipment_options jsonb not null default '[]'::jsonb,  -- [["Kettlebell"],["Dumbbell"]] = alternatives of required items
  primary_pillar text not null check (public.is_valid_pillar(primary_pillar)),
  secondary_pillar text check (public.is_valid_pillar(secondary_pillar)),
  where_setting text not null check (where_setting in ('Home or gym','Gym','Outdoor or track')),
  best_with text not null check (best_with in ('Solo OK','Coach helpful')),
  media_url text,                        -- GIF file name or link
  source text not null default 'library' check (source in ('library','promoted')),
  promoted_from uuid,                    -- custom_exercises.id when source = 'promoted'
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_name_unique unique (name_normalized)
);
create index exercises_name_trgm on public.exercises using gin (name_normalized extensions.gin_trgm_ops);

-- Other names athletes use for the same exercise (KB DL, RDL, BSS …)
create table public.exercise_aliases (
  id bigint generated always as identity primary key,
  exercise_id text not null references public.exercises(id) on delete cascade,
  alias text not null,
  alias_normalized text generated always as (lower(regexp_replace(trim(alias), '\s+', ' ', 'g'))) stored,
  created_at timestamptz not null default now(),
  constraint exercise_aliases_unique unique (alias_normalized)
);
create index exercise_aliases_trgm on public.exercise_aliases using gin (alias_normalized extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Station prescriptions (Foundation / Development rows: exercise + dose)
-- ---------------------------------------------------------------------------
create table public.station_prescriptions (
  id bigint generated always as identity primary key,
  station_id text not null references public.stations(id) on delete cascade,
  level text not null check (level in ('Foundation','Development')),
  sort_order int not null,
  exercise_id text not null references public.exercises(id),
  dose text,                             -- e.g. 'Heavy, 5 × 10'
  primary_pillar text not null check (public.is_valid_pillar(primary_pillar)),
  secondary_pillar text check (public.is_valid_pillar(secondary_pillar)),
  load text not null check (load in ('Low','Moderate','High')),
  list text not null default 'Core list' check (list in ('Core list','Added')),
  where_setting text not null check (where_setting in ('Home or gym','Gym','Outdoor or track')),
  best_with text not null check (best_with in ('Solo OK','Group-friendly','Coach helpful')),
  unique (station_id, level, sort_order)
);
create index station_prescriptions_exercise on public.station_prescriptions(exercise_id);

-- ---------------------------------------------------------------------------
-- Race-specific sessions (Specific level)
-- ---------------------------------------------------------------------------
create table public.race_sessions (
  id text primary key,                   -- RS0001 …
  station_id text not null references public.stations(id) on delete cascade,
  sort_order int not null,
  name text not null,
  dose text,
  session_type text not null check (session_type in ('Race pace','Test / time trial','Compromised (brick)','Overload',
    'Technique & standards','Strategy & pacing','Simulation','Transition','Doubles','Race prep')),
  primary_pillar text not null check (public.is_valid_pillar(primary_pillar)),
  secondary_pillar text check (public.is_valid_pillar(secondary_pillar)),
  load text not null check (load in ('Low','Moderate','High')),
  where_setting text not null check (where_setting in ('Home or gym','Gym','Outdoor or track')),
  best_with text not null check (best_with in ('Solo OK','Group-friendly','Partner or group','Group','Coach helpful','Coach or partner')),
  courage text check (courage in ('Test','Race rehearsal','Overload','Finish surge')),
  unique (station_id, sort_order)
);

-- ---------------------------------------------------------------------------
-- Athlete custom exercises
-- ---------------------------------------------------------------------------
create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  name_normalized text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  equipment text,
  movement_pattern text,                 -- optional hint from the athlete; coaches set the real tags on promotion
  notes text,
  review_status text not null default 'private'
    check (review_status in ('private','in_review','approved','merged','rejected')),
  merged_into text references public.exercises(id),     -- set when merged into an existing exercise
  promoted_exercise_id text references public.exercises(id),  -- set when approved as a new library exercise
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
create index custom_exercises_name on public.custom_exercises(name_normalized);
create index custom_exercises_owner on public.custom_exercises(created_by);
create index custom_exercises_trgm on public.custom_exercises using gin (name_normalized extensions.gin_trgm_ops);

-- One row each time an athlete uses an exercise in a workout they build or log.
-- Exactly one of exercise_id / custom_exercise_id is set.
create table public.exercise_usage (
  id bigint generated always as identity primary key,
  athlete_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise_id text references public.exercises(id),
  custom_exercise_id uuid references public.custom_exercises(id) on delete cascade,
  workout_ref text,                      -- id of the athlete's workout in your existing workout tables
  used_at timestamptz not null default now(),
  constraint exercise_usage_one_target check ((exercise_id is null) <> (custom_exercise_id is null))
);
create index exercise_usage_custom on public.exercise_usage(custom_exercise_id, used_at);
create index exercise_usage_exercise on public.exercise_usage(exercise_id, used_at);

-- Promotion thresholds (editable by coaches)
create table public.app_settings (
  key text primary key,
  value numeric not null,
  description text
);
insert into public.app_settings (key, value, description) values
  ('promotion_min_athletes', 5, 'Distinct athletes using the same custom exercise name before it enters the review list'),
  ('promotion_window_days', 30, 'Look-back window in days for counting athletes');

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
-- Everything the workout builder needs for one station, in one place.
create or replace view public.v_station_library with (security_invoker = true) as
select s.id as station_id, s.name as station, s.group_name, 'exercise'::text as row_type,
       p.level, p.sort_order, p.exercise_id as item_id, e.name, p.dose, e.movement_pattern, e.equipment,
       p.primary_pillar, p.secondary_pillar, p.load, p.where_setting, p.best_with, null::text as courage,
       null::text as session_type, e.media_url
from public.station_prescriptions p
join public.stations s on s.id = p.station_id
join public.exercises e on e.id = p.exercise_id
where e.is_active
union all
select s.id, s.name, s.group_name, 'session', 'Specific', r.sort_order, r.id, r.name, r.dose, null, null,
       r.primary_pillar, r.secondary_pillar, r.load, r.where_setting, r.best_with, r.courage, r.session_type, null
from public.race_sessions r
join public.stations s on s.id = r.station_id;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
-- Type-ahead search across exercise names and aliases. Use it while an athlete
-- types so they pick an existing exercise before creating a custom one.
create or replace function public.search_exercises(q text, max_results int default 8)
returns table (exercise_id text, name text, matched_on text, score real)
language sql stable set search_path = public, extensions as $$
  with needle as (select lower(regexp_replace(trim(q), '\s+', ' ', 'g')) as n),
  hits as (
    select e.id, e.name, e.name as matched, similarity(e.name_normalized, needle.n) as sim,
           (e.name_normalized like needle.n || '%') as prefix
    from public.exercises e, needle
    where e.is_active and (e.name_normalized % needle.n or e.name_normalized like '%' || needle.n || '%')
    union all
    select e.id, e.name, a.alias, similarity(a.alias_normalized, needle.n),
           (a.alias_normalized like needle.n || '%')
    from public.exercise_aliases a join public.exercises e on e.id = a.exercise_id, needle
    where e.is_active and (a.alias_normalized % needle.n or a.alias_normalized like '%' || needle.n || '%')
  )
  select id, name, matched, max(sim + case when prefix then 0.3 else 0 end)::real as score
  from hits
  group by id, name, matched
  order by score desc, name
  limit max_results
$$;

-- Custom exercise names used by enough different athletes to deserve a coach review.
create or replace view public.v_promotion_candidates with (security_invoker = true) as
with win as (
  select (select value from public.app_settings where key = 'promotion_window_days')::int as days,
         (select value from public.app_settings where key = 'promotion_min_athletes')::int as min_athletes
), usage as (
  select c.name_normalized,
         count(distinct u.athlete_id) as athletes,
         count(*) as uses,
         max(u.used_at) as last_used
  from public.exercise_usage u
  join public.custom_exercises c on c.id = u.custom_exercise_id
  cross join win
  where u.used_at >= now() - make_interval(days => win.days)
    and c.review_status in ('private','in_review')
  group by c.name_normalized
)
select u.name_normalized,
       (select c.name from public.custom_exercises c where c.name_normalized = u.name_normalized order by c.created_at limit 1) as example_name,
       u.athletes, u.uses, u.last_used,
       (select array_agg(c.id) from public.custom_exercises c
         where c.name_normalized = u.name_normalized and c.review_status in ('private','in_review')) as custom_exercise_ids,
       (select m.exercise_id from public.search_exercises(u.name_normalized, 1) m) as closest_library_id,
       (select m.name from public.search_exercises(u.name_normalized, 1) m) as closest_library_name
from usage u, win
where u.athletes >= win.min_athletes
order by u.athletes desc, u.uses desc;

-- Coach action: merge a custom exercise into an existing library exercise.
-- Also merges every other custom exercise with the same normalized name, repoints
-- their usage to the library exercise, and saves the name as an alias.
create or replace function public.merge_custom_exercise(p_custom_id uuid, p_exercise_id text, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_name text; v_count int;
begin
  if not public.is_coach() then raise exception 'Only coaches can merge custom exercises'; end if;
  select name_normalized into v_name from public.custom_exercises where id = p_custom_id;
  if v_name is null then raise exception 'Custom exercise % not found', p_custom_id; end if;

  update public.custom_exercises
     set review_status = 'merged', merged_into = p_exercise_id,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where name_normalized = v_name and review_status in ('private','in_review');
  get diagnostics v_count = row_count;

  update public.exercise_usage u
     set exercise_id = p_exercise_id, custom_exercise_id = null
    from public.custom_exercises c
   where u.custom_exercise_id = c.id and c.name_normalized = v_name and c.merged_into = p_exercise_id;

  insert into public.exercise_aliases (exercise_id, alias)
  select p_exercise_id, (select name from public.custom_exercises where id = p_custom_id)
  where not exists (select 1 from public.exercise_aliases where alias_normalized = v_name)
    and not exists (select 1 from public.exercises where name_normalized = v_name);
  return v_count;
end $$;

-- Coach action: approve a custom exercise as a new library exercise with full tags.
-- Returns the new exercise id. Add station_prescriptions rows separately to place it in stations.
create or replace function public.promote_custom_exercise(
  p_custom_id uuid,
  p_name text,
  p_movement_pattern text,
  p_equipment text,
  p_primary_pillar text,
  p_secondary_pillar text default null,
  p_where_setting text default 'Home or gym',
  p_best_with text default 'Solo OK',
  p_equipment_options jsonb default '[]'::jsonb,
  p_note text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare v_id text; v_norm text; v_next int;
begin
  if not public.is_coach() then raise exception 'Only coaches can promote custom exercises'; end if;
  select name_normalized into v_norm from public.custom_exercises where id = p_custom_id;
  if v_norm is null then raise exception 'Custom exercise % not found', p_custom_id; end if;

  select coalesce(max(substring(id from 3)::int), 0) + 1 into v_next from public.exercises where id ~ '^EX[0-9]+$';
  v_id := 'EX' || lpad(v_next::text, 4, '0');

  insert into public.exercises (id, name, movement_pattern, equipment, equipment_options, primary_pillar,
                                secondary_pillar, where_setting, best_with, source, promoted_from)
  values (v_id, p_name, p_movement_pattern, p_equipment, p_equipment_options, p_primary_pillar,
          p_secondary_pillar, p_where_setting, p_best_with, 'promoted', p_custom_id);

  update public.custom_exercises
     set review_status = 'approved', promoted_exercise_id = v_id,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where name_normalized = v_norm and review_status in ('private','in_review');

  update public.exercise_usage u
     set exercise_id = v_id, custom_exercise_id = null
    from public.custom_exercises c
   where u.custom_exercise_id = c.id and c.promoted_exercise_id = v_id;

  -- keep the athletes' wording as an alias when it differs from the library name
  insert into public.exercise_aliases (exercise_id, alias)
  select v_id, (select name from public.custom_exercises where id = p_custom_id)
  where lower(regexp_replace(trim(p_name), '\s+', ' ', 'g')) <> v_norm
    and not exists (select 1 from public.exercise_aliases where alias_normalized = v_norm);
  return v_id;
end $$;

-- Coach action: reject all pending custom exercises with this name.
create or replace function public.reject_custom_exercise(p_custom_id uuid, p_note text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_norm text; v_count int;
begin
  if not public.is_coach() then raise exception 'Only coaches can reject custom exercises'; end if;
  select name_normalized into v_norm from public.custom_exercises where id = p_custom_id;
  update public.custom_exercises
     set review_status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where name_normalized = v_norm and review_status in ('private','in_review');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger exercises_touch before update on public.exercises
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.coaches enable row level security;
alter table public.races enable row level security;
alter table public.race_formats enable row level security;
alter table public.stations enable row level security;
alter table public.station_races enable row level security;
alter table public.exercises enable row level security;
alter table public.exercise_aliases enable row level security;
alter table public.station_prescriptions enable row level security;
alter table public.race_sessions enable row level security;
alter table public.custom_exercises enable row level security;
alter table public.exercise_usage enable row level security;
alter table public.app_settings enable row level security;

-- Library: every signed-in user can read; only coaches can write.
do $$
declare t text;
begin
  foreach t in array array['races','race_formats','stations','station_races','exercises','exercise_aliases',
                           'station_prescriptions','race_sessions','app_settings']
  loop
    execute format('create policy "%1$s read" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s coach write" on public.%1$I for all to authenticated using (public.is_coach()) with check (public.is_coach())', t);
  end loop;
end $$;

create policy "coaches read self" on public.coaches for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

-- Custom exercises: athletes manage their own; coaches see and review all.
create policy "custom own read" on public.custom_exercises for select to authenticated
  using (created_by = auth.uid() or public.is_coach());
create policy "custom own insert" on public.custom_exercises for insert to authenticated
  with check (created_by = auth.uid() and review_status = 'private');
create policy "custom own update" on public.custom_exercises for update to authenticated
  using (created_by = auth.uid() and review_status = 'private')
  with check (created_by = auth.uid() and review_status = 'private');
create policy "custom own delete" on public.custom_exercises for delete to authenticated
  using (created_by = auth.uid() and review_status = 'private');
create policy "custom coach update" on public.custom_exercises for update to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Usage: athletes log and read their own; coaches read all.
create policy "usage own read" on public.exercise_usage for select to authenticated
  using (athlete_id = auth.uid() or public.is_coach());
create policy "usage own insert" on public.exercise_usage for insert to authenticated
  with check (athlete_id = auth.uid()
    and (custom_exercise_id is null
         or exists (select 1 from public.custom_exercises c where c.id = custom_exercise_id and c.created_by = auth.uid())));
create policy "usage own delete" on public.exercise_usage for delete to authenticated
  using (athlete_id = auth.uid());

-- Function access
revoke all on function public.merge_custom_exercise(uuid, text, text) from public, anon;
revoke all on function public.promote_custom_exercise(uuid, text, text, text, text, text, text, text, jsonb, text) from public, anon;
revoke all on function public.reject_custom_exercise(uuid, text) from public, anon;
grant execute on function public.merge_custom_exercise(uuid, text, text) to authenticated;
grant execute on function public.promote_custom_exercise(uuid, text, text, text, text, text, text, text, jsonb, text) to authenticated;
grant execute on function public.reject_custom_exercise(uuid, text) to authenticated;
grant execute on function public.search_exercises(text, int) to authenticated;
