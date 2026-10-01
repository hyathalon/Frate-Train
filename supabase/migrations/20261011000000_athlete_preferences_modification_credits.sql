-- Migration 15 (step 6.1)
-- 1. athlete_preferences: every onboarding answer (onboarding-and-check-in.md §1),
--    in the questionnaire's own terms. The server turns them into generator inputs
--    and library terms. Health answers (Q16–18) are refused until the privacy
--    checklist and consent step exist (decision B).
-- 2. athlete_preference_changes: what changed, when and by whom (§10: the coach
--    is notified of members' changes).
-- 3. Modification credits (§16): athlete-requested replans use a credit;
--    self-serve athletes get a monthly allowance plus purchased packs.

create table public.athlete_preferences (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object')
    check (not (answers ?| array['current_body_reports', 'injury_history', 'cycle_tracking'])),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id)
);
alter table public.athlete_preferences enable row level security;
create policy "preferences own or coach read" on public.athlete_preferences for select to authenticated
  using (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
create policy "preferences own or coach write" on public.athlete_preferences for insert to authenticated
  with check (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));
create policy "preferences own or coach update" on public.athlete_preferences for update to authenticated
  using (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()))
  with check (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

create table public.athlete_preference_changes (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  keys text[] not null,
  before jsonb not null,
  after jsonb not null
);
create index athlete_preference_changes_athlete on public.athlete_preference_changes(athlete_id, changed_at desc);
alter table public.athlete_preference_changes enable row level security;
create policy "preference changes own or coach read" on public.athlete_preference_changes for select to authenticated
  using (public.is_coach() or exists (select 1 from public.athletes a where a.id = athlete_id and a.user_id = auth.uid()));

-- Every update records the answers that changed.
create or replace function public.log_preference_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  changed text[];
begin
  select coalesce(array_agg(k order by k), '{}') into changed
    from (select key as k from jsonb_each(old.answers) union select key from jsonb_each(new.answers)) keys
   where old.answers -> k is distinct from new.answers -> k;
  if array_length(changed, 1) > 0 then
    insert into public.athlete_preference_changes (athlete_id, changed_by, keys, before, after)
    values (new.athlete_id, new.updated_by, changed,
            (select coalesce(jsonb_object_agg(k, old.answers -> k), '{}') from unnest(changed) k),
            (select coalesce(jsonb_object_agg(k, new.answers -> k), '{}') from unnest(changed) k));
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger athlete_preferences_log before update on public.athlete_preferences
  for each row execute function public.log_preference_changes();

-- Modification credits.
alter table public.athlete_credit_ledger drop constraint athlete_credit_ledger_kind_check;
alter table public.athlete_credit_ledger add constraint athlete_credit_ledger_kind_check
  check (kind in ('confirmation', 'modification'));
alter table public.generation_events drop constraint generation_events_counts_as_check;
alter table public.generation_events add constraint generation_events_counts_as_check
  check (counts_as in ('preview', 'confirmation', 'modification'));
insert into public.app_settings (key, value, description) values
  ('app_monthly_modifications', 2, 'App-tier athletes: plan changes (athlete-requested replans) per calendar month (placeholder, coach to confirm)'),
  ('extra_modification_pack_size', 4, 'Plan changes in one purchased pack'),
  ('extra_modification_pack_price_aud', 10, 'Price of one plan-change pack in AUD')
on conflict (key) do nothing;
