-- Baseline: tables originally created by hand in the Seoul SQL editor,
-- rebuilt from its live schema so a fresh database can replay every migration.
--
-- Shapes are as they were BEFORE later migrations touched them:
--   - programs has no program-builder columns (added by 20260923000000).
--   - the per-block table is still called `exercises`; 20260923120000 renames
--     it to program_exercises, giving the same constraint names as Seoul.
--   - hyathlon_reference is created by 20260922000000, so it isn't here.
-- Row level security is on with no policies (service key only), as in Seoul.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  goal text,
  level text,
  frequency text,
  avg_time text,
  setting text,
  equipment text,
  method text,
  category text,
  created_at timestamp default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references public.programs(id) on delete cascade,
  name text not null,
  focus text,
  block_order integer
);

create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  name text,
  athlete_type text default 'hyrox',
  goal_race text,
  goal_date date,
  training_days_per_week integer default 4,
  level text default 'intermediate',
  equipment text[],
  created_at timestamp default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid references public.blocks(id) on delete cascade,
  name text not null,
  sets text,
  reps text,
  rest text,
  notes text,
  gif_url text,
  muscle_group text,
  equipment_type text,
  difficulty text,
  instructions text
);

alter table public.programs enable row level security;
alter table public.blocks enable row level security;
alter table public.athletes enable row level security;
alter table public.exercises enable row level security;
