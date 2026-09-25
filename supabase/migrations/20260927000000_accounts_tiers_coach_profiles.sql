-- Milestone 1, migration 1: accounts, athlete tiers, coach profiles, settings,
-- and a credit ledger ready for purchased extras (no payments yet).

-- ---------------------------------------------------------------------------
-- Athletes: link to a login, tier, assigned coach, where they train, timezone,
-- and billing fields for later. The table is empty, so constraints are safe.
-- ---------------------------------------------------------------------------
alter table public.athletes
  add column user_id uuid unique references auth.users(id) on delete set null,
  add column tier text not null default 'app' check (tier in ('app', 'member')),
  add column coach_user_id uuid references public.coaches(user_id) on delete set null,
  add column training_locations text[] not null default '{}'
    check (training_locations <@ array['Home', 'Gym', 'Outdoor']::text[]),
  add column timezone text not null default 'Australia/Sydney',
  add column billing_status text not null default 'none'
    check (billing_status in ('none', 'trial', 'active', 'past_due', 'cancelled')),
  add column billing_provider text,
  add column billing_customer_ref text;

alter table public.athletes
  add constraint athletes_level_check check (level in ('beginner', 'intermediate', 'advanced'));

-- Athletes read their own row; coaches read and write every row.
-- Athletes can't write it directly (tier and billing must stay server-controlled).
create policy "athletes own read" on public.athletes for select to authenticated
  using (user_id = auth.uid() or public.is_coach());
create policy "athletes coach write" on public.athletes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------------------------------------------------------------------------
-- Coach-only athlete profile. Used by program and block generation.
-- Athletes can't read it; shared notes come through my_shared_coach_notes().
-- ---------------------------------------------------------------------------
create table public.athlete_coach_profiles (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  priority_pillars text[] not null default '{}'
    check (priority_pillars <@ array['Aerobic Engine', 'Threshold', 'Durability', 'Economy',
                                      'Balanced Athleticism', 'Fatigue Management']::text[]),
  limiters text,
  coach_notes text,
  share_notes boolean not null default false,
  updated_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.athlete_coach_profiles enable row level security;
create policy "coach profiles coach only" on public.athlete_coach_profiles for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

create trigger athlete_coach_profiles_touch before update on public.athlete_coach_profiles
for each row execute function public.touch_updated_at();

-- The signed-in athlete's coach notes, only when the coach has shared them.
create or replace function public.my_shared_coach_notes() returns text
language sql stable security definer set search_path = public as $$
  select p.coach_notes
    from public.athlete_coach_profiles p
    join public.athletes a on a.id = p.athlete_id
   where a.user_id = auth.uid() and p.share_notes
$$;
revoke all on function public.my_shared_coach_notes() from public, anon;
grant execute on function public.my_shared_coach_notes() to authenticated;

-- ---------------------------------------------------------------------------
-- Credit ledger for purchased extras (e.g. a pack of extra confirmations).
-- Balance = sum(delta) per athlete and kind. Purchased credits don't expire and
-- are used after the monthly allowance. Written only by the server.
-- ---------------------------------------------------------------------------
create table public.athlete_credit_ledger (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  kind text not null check (kind in ('confirmation')),
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'used', 'refund', 'grant')),
  amount numeric,
  currency text,
  provider text,
  provider_ref text,
  program_id uuid,
  created_at timestamptz not null default now()
);
create index athlete_credit_ledger_athlete on public.athlete_credit_ledger(athlete_id, kind);

alter table public.athlete_credit_ledger enable row level security;
create policy "credit ledger own read" on public.athlete_credit_ledger for select to authenticated
  using (public.is_coach()
         or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Settings (editable by coaches). Limits for app-tier athletes are per calendar
-- month in the athlete's timezone.
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description) values
  ('progress_adherence_min', 0.8, 'Core adherence at or above this progresses the next block'),
  ('hold_adherence_min', 0.5, 'Core adherence at or above this (and below progress) holds; below it steps down'),
  ('optional_promote_min_weeks', 3, 'Optional session done in at least this many weeks of a 4-week block becomes core'),
  ('optional_drop_max_weeks', 1, 'Optional session done in at most this many weeks counts as rarely done'),
  ('optional_drop_after_blocks', 2, 'Drop an optional session after this many rarely-done blocks in a row'),
  ('checkin_opens_days_before_block_end', 5, 'Check-in becomes available this many days before a block ends'),
  ('missed_checkin_grace_days', 3, 'Days after a block ends before a HOLD block is generated and the coach is flagged'),
  ('block_attempts_per_day_max', 5, 'Maximum generation attempts per block per day'),
  ('app_monthly_outline_previews', 4, 'App-tier athletes: season outline previews per calendar month'),
  ('app_monthly_confirmations', 2, 'App-tier athletes: confirmations (block 1 + activate) per calendar month'),
  ('coach_daily_program_builds', 100, 'Coaches: program builds per rolling 24 hours (safety net)'),
  ('extra_confirmation_pack_size', 4, 'Confirmations in one purchased pack'),
  ('extra_confirmation_pack_price_aud', 10, 'Price of one confirmation pack in AUD'),
  ('daily_spend_alert_usd', 10, 'Alert the coach when Anthropic spend for the day (Sydney time) passes this, in USD'),
  ('price_sonnet5_input_per_mtok_usd', 2, 'Claude Sonnet 5 input price per million tokens (USD)'),
  ('price_sonnet5_output_per_mtok_usd', 10, 'Claude Sonnet 5 output price per million tokens (USD)'),
  ('price_sonnet5_cache_write_per_mtok_usd', 2.5, 'Claude Sonnet 5 5-minute cache write price per million tokens (USD)'),
  ('price_sonnet5_cache_read_per_mtok_usd', 0.2, 'Claude Sonnet 5 cache read price per million tokens (USD)');
