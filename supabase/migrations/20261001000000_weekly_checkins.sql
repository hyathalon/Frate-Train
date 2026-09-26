-- Migration 5: weekly check-ins. Once a week, before the coming week, the
-- athlete reports energy, sleep and availability changes. The Edge Function
-- regenerates that one week when needed (call type 'week_adjust').
-- No soreness/niggle question yet: the health fields stay empty (enforced)
-- until the privacy checklist and a consent step are done.

create table public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  week int not null check (week >= 1),
  submitted_by uuid not null references auth.users(id),
  energy text not null check (energy in ('good', 'ok', 'poor')),
  sleep text not null check (sleep in ('good', 'ok', 'poor')),
  availability jsonb,                          -- { training_days?, minutes_per_session?, applies: 'this_week' | 'ongoing' }
  status text not null default 'saved' check (status in ('saved', 'adjusting', 'adjusted', 'unchanged', 'failed')),
  reasons text[] not null default '{}',        -- why the week was adjusted
  previous_week jsonb,                         -- the week before adjustment, for comparison
  last_error text,
  health jsonb,
  health_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, week),
  constraint weekly_checkins_no_health_data_yet check (health is null and health_consent_at is null)
);

create trigger weekly_checkins_touch before update on public.weekly_checkins
for each row execute function public.touch_updated_at();

alter table public.weekly_checkins enable row level security;
create policy "weekly checkins read" on public.weekly_checkins for select to authenticated
  using (public.is_coach() or public.owns_program(program_id));

-- New call type for regenerating one week.
alter table public.ai_call_models drop constraint ai_call_models_call_type_check;
alter table public.ai_call_models add constraint ai_call_models_call_type_check
  check (call_type in ('outline_preview', 'confirmation_block', 'next_block', 'hold_block', 'replan', 'week_adjust'));
insert into public.ai_call_models (call_type, model, effort_member, effort_other) values ('week_adjust', 'claude-sonnet-5', 'high', 'medium');

alter table public.generation_events drop constraint generation_events_call_type_check;
alter table public.generation_events add constraint generation_events_call_type_check
  check (call_type in ('outline_preview', 'confirmation_block', 'next_block', 'hold_block', 'replan', 'week_adjust'));
