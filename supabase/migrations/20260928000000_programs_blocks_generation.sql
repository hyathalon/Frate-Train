-- Milestone 1, migration 2: adaptive programs (outline + 4-week blocks),
-- check-ins, athlete exercise edits, generation usage/cost, coach alerts,
-- and the model per call type with model prices.
--
-- Writes to programs, blocks, check-ins, generation events and alerts go
-- through the generate-program Edge Function (secret key). Signed-in users
-- only read them, except athletes' own exercise edits.

-- ---------------------------------------------------------------------------
-- Models and prices (per million tokens, USD), and the model per call type.
-- ---------------------------------------------------------------------------
create table public.ai_models (
  model text primary key,
  input_per_mtok_usd numeric not null check (input_per_mtok_usd >= 0),
  output_per_mtok_usd numeric not null check (output_per_mtok_usd >= 0),
  cache_write_per_mtok_usd numeric not null check (cache_write_per_mtok_usd >= 0),
  cache_read_per_mtok_usd numeric not null check (cache_read_per_mtok_usd >= 0),
  updated_at timestamptz not null default now()
);

insert into public.ai_models (model, input_per_mtok_usd, output_per_mtok_usd, cache_write_per_mtok_usd, cache_read_per_mtok_usd) values
  ('claude-sonnet-5', 2, 10, 2.5, 0.2),
  ('claude-haiku-4-5', 1, 5, 1.25, 0.1);

create table public.ai_call_models (
  call_type text primary key
    check (call_type in ('outline_preview', 'confirmation_block', 'next_block', 'hold_block', 'replan')),
  model text not null references public.ai_models(model),
  updated_at timestamptz not null default now()
);

insert into public.ai_call_models (call_type, model) values
  ('outline_preview', 'claude-haiku-4-5'),
  ('confirmation_block', 'claude-sonnet-5'),
  ('next_block', 'claude-sonnet-5'),
  ('hold_block', 'claude-sonnet-5'),
  ('replan', 'claude-sonnet-5');

-- Prices now live in ai_models.
delete from public.app_settings where key like 'price_sonnet5_%';

-- ---------------------------------------------------------------------------
-- Programs
-- ---------------------------------------------------------------------------
create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  status text not null default 'preview'
    check (status in ('preview', 'active', 'completed', 'archived', 'failed')),
  race_name text,
  race_date date not null,
  start_date date not null,
  total_weeks int not null check (total_weeks between 4 and 16),
  inputs jsonb not null default '{}'::jsonb,   -- Program Builder answers
  outline jsonb,                               -- current outline (latest version)
  outline_version int not null default 0,
  confirmed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (race_date >= start_date)
);
-- One active program per athlete; confirming a new one archives the old.
create unique index training_programs_one_active on public.training_programs(athlete_id) where status = 'active';
create index training_programs_athlete on public.training_programs(athlete_id, created_at);

create trigger training_programs_touch before update on public.training_programs
for each row execute function public.touch_updated_at();

create table public.program_outline_versions (
  program_id uuid not null references public.training_programs(id) on delete cascade,
  version int not null check (version >= 1),
  outline jsonb not null,
  reason text not null,                        -- e.g. 'preview', 're-plan after block 2: behind'
  created_at timestamptz not null default now(),
  primary key (program_id, version)
);

create table public.program_blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  block_no int not null check (block_no >= 1),
  kind text not null default 'normal' check (kind in ('normal', 'hold')),
  start_week int not null check (start_week >= 1),
  end_week int not null,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  sessions jsonb,                              -- weeks → sessions → items (library ids)
  targets jsonb,                               -- targets the function computed for this block
  attempts int not null default 0,
  last_error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, block_no),
  check (end_week >= start_week)
);

-- ---------------------------------------------------------------------------
-- Check-ins (difficulty only for now). The health fields are a placeholder for
-- a pain/injury question with a consent step; the check below keeps them empty
-- until a later migration relaxes it.
-- ---------------------------------------------------------------------------
create table public.program_checkins (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  block_no int not null check (block_no >= 1),
  submitted_by uuid not null references auth.users(id),
  days_available int not null check (days_available between 1 and 7),
  core_done_per_week int[] not null,           -- one entry per week of the block
  optional_completions jsonb not null default '{}'::jsonb,  -- { slot: weeks done }
  difficulty int not null check (difficulty between 1 and 5),
  health jsonb,
  health_consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (program_id, block_no),
  constraint program_checkins_no_health_data_yet check (health is null and health_consent_at is null)
);

-- ---------------------------------------------------------------------------
-- Athlete exercise edits, stored apart from the generated sessions.
-- ---------------------------------------------------------------------------
create table public.session_exercise_edits (
  id bigint generated always as identity primary key,
  program_id uuid not null references public.training_programs(id) on delete cascade,
  block_no int not null check (block_no >= 1),
  week int not null check (week >= 1),
  session_key text not null,                   -- identifies the session within the week
  action text not null check (action in ('swap', 'add', 'remove')),
  position int check (position >= 0),          -- item index in the session
  original jsonb,                              -- the generated item being swapped or removed
  replacement_exercise_id text references public.exercises(id),
  replacement_custom_exercise_id uuid references public.custom_exercises(id),
  dose text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,                     -- set by "Reset session"
  constraint session_exercise_edits_replacement check (
    case action
      when 'remove' then replacement_exercise_id is null and replacement_custom_exercise_id is null
      else (replacement_exercise_id is null) <> (replacement_custom_exercise_id is null)
    end)
);
create index session_exercise_edits_program on public.session_exercise_edits(program_id, block_no);

-- ---------------------------------------------------------------------------
-- Generation usage and cost: rate limits, the spend alert and cost reports.
-- counts_as marks the calls that use an allowance ('preview' or 'confirmation').
-- ---------------------------------------------------------------------------
create table public.generation_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,   -- null for scheduled jobs
  athlete_id uuid references public.athletes(id) on delete set null,
  program_id uuid references public.training_programs(id) on delete set null,
  block_no int,
  call_type text not null
    check (call_type in ('outline_preview', 'confirmation_block', 'next_block', 'hold_block', 'replan')),
  is_repair boolean not null default false,
  counts_as text check (counts_as in ('preview', 'confirmation')),
  paid_with text check (paid_with in ('monthly', 'credit')),
  model text not null,
  status text not null check (status in ('ok', 'failed')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_creation_input_tokens int not null default 0,
  cache_read_input_tokens int not null default 0,
  cost_usd numeric not null default 0,
  duration_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index generation_events_user on public.generation_events(user_id, created_at);
create index generation_events_athlete on public.generation_events(athlete_id, counts_as, created_at);
create index generation_events_created on public.generation_events(created_at);

-- ---------------------------------------------------------------------------
-- Coach alerts (hold blocks, spend, failed generations).
-- ---------------------------------------------------------------------------
create table public.coach_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('hold_block', 'spend', 'generation_failed')),
  alert_date date not null,                    -- Sydney date; one spend alert per day
  athlete_id uuid references public.athletes(id) on delete cascade,
  program_id uuid references public.training_programs(id) on delete cascade,
  message text not null,
  details jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users(id)
);
create unique index coach_alerts_one_spend_per_day on public.coach_alerts(alert_date) where kind = 'spend';
create index coach_alerts_unread on public.coach_alerts(created_at) where read_at is null;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- True when the signed-in user is the athlete this program belongs to.
create or replace function public.owns_program(p_program_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.training_programs p
    join public.athletes a on a.id = p.athlete_id
    where p.id = p_program_id and a.user_id = auth.uid())
$$;
revoke all on function public.owns_program(uuid) from public, anon;
grant execute on function public.owns_program(uuid) to authenticated;

alter table public.ai_models enable row level security;
alter table public.ai_call_models enable row level security;
alter table public.training_programs enable row level security;
alter table public.program_outline_versions enable row level security;
alter table public.program_blocks enable row level security;
alter table public.program_checkins enable row level security;
alter table public.session_exercise_edits enable row level security;
alter table public.generation_events enable row level security;
alter table public.coach_alerts enable row level security;

-- Models, prices, usage: coaches only.
create policy "ai models coach only" on public.ai_models for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "ai call models coach only" on public.ai_call_models for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
create policy "generation events coach read" on public.generation_events for select to authenticated
  using (public.is_coach());

-- Alerts: coaches read them and mark them read.
create policy "coach alerts coach read" on public.coach_alerts for select to authenticated
  using (public.is_coach());
create policy "coach alerts coach update" on public.coach_alerts for update to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Programs and their parts: the athlete who owns them, and coaches, can read.
create policy "programs read" on public.training_programs for select to authenticated
  using (public.is_coach() or public.owns_program(id));
create policy "outline versions read" on public.program_outline_versions for select to authenticated
  using (public.is_coach() or public.owns_program(program_id));
create policy "blocks read" on public.program_blocks for select to authenticated
  using (public.is_coach() or public.owns_program(program_id));
create policy "checkins read" on public.program_checkins for select to authenticated
  using (public.is_coach() or public.owns_program(program_id));

-- Exercise edits: the owning athlete adds them and resets them (reverted_at);
-- a custom exercise must be their own. Coaches can read all edits.
create policy "edits read" on public.session_exercise_edits for select to authenticated
  using (public.is_coach() or public.owns_program(program_id));
create policy "edits own insert" on public.session_exercise_edits for insert to authenticated
  with check (
    public.owns_program(program_id)
    and created_by = auth.uid()
    and reverted_at is null
    and (replacement_custom_exercise_id is null
         or exists (select 1 from public.custom_exercises c
                    where c.id = replacement_custom_exercise_id and c.created_by = auth.uid())));
create policy "edits own reset" on public.session_exercise_edits for update to authenticated
  using (public.owns_program(program_id) and created_by = auth.uid())
  with check (public.owns_program(program_id) and created_by = auth.uid());

-- Only reverted_at may change on an edit (the "Reset session" action).
create or replace function public.session_exercise_edits_only_reset() returns trigger
language plpgsql as $$
begin
  if (to_jsonb(new) - 'reverted_at') is distinct from (to_jsonb(old) - 'reverted_at') then
    raise exception 'Only reverted_at can change on an exercise edit';
  end if;
  return new;
end $$;
create trigger session_exercise_edits_only_reset before update on public.session_exercise_edits
for each row execute function public.session_exercise_edits_only_reset();
