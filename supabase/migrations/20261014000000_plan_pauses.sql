-- Migration 18: pausing a plan (any tier). A coach/admin can pause and restart any
-- athlete's plan on request (injury, illness, travel); app_monthly athletes can pause
-- themselves. A pause stops new plans and shifts the plan's end date by the paused
-- time. Refunds aren't advertised; they're handled case by case outside the app.

alter table public.athletes
  add column plan_paused_since timestamptz,
  add column plan_paused_days int not null default 0 check (plan_paused_days >= 0);

create table public.plan_pauses (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  paused_at timestamptz not null default now(),
  paused_by uuid references auth.users(id) on delete set null,
  reason text not null,
  resumed_at timestamptz,
  resumed_by uuid references auth.users(id) on delete set null
);
create index plan_pauses_athlete on public.plan_pauses(athlete_id, paused_at desc);
alter table public.plan_pauses enable row level security;
create policy "plan pauses own or coach read" on public.plan_pauses for select to authenticated
  using (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
-- Written only by the server.

update public.app_settings set description = 'app_12wk: 12 weeks (3 months) paid up front (AUD)' where key = 'plan_app_12wk_price_aud';
