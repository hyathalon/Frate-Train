-- Migration 16: confirmed plans and credit rules (replaces 6.1's "2 plan changes a
-- month + 4 for $10"). No payments yet: billing will keep plan, paid_weeks and
-- plan_started_at up to date.
--
-- Plans: app_weekly ($24.95/week, cancel any time; pause stops new plans),
-- app_12wk ($239 up front), coach_run ($150/month, no strength programming),
-- coach_hybrid ($250/month, includes strength programming).
-- Re-plans (athlete-requested "Rebuild my plan" / regenerate a week):
--   app_weekly: 1 per 4 weeks of paid time; the first after 4 paid weeks; unused don't carry over.
--   app_12wk: 3 in the 12-week block.
--   Extra re-plans $10 each (purchased credits). Coaching plans unlimited.
-- Coach credits (separate): 1 credit = $30; written reply 1, short video 2, online Q&A call (max 10 min) 4.

alter table public.athletes
  add column plan text check (plan in ('app_weekly', 'app_12wk', 'coach_run', 'coach_hybrid')),
  add column plan_started_at date,
  add column paid_weeks int not null default 0 check (paid_weeks >= 0);

-- Re-plan and coach credits in the ledger ("modification" from 6.1 becomes "replan").
alter table public.athlete_credit_ledger drop constraint athlete_credit_ledger_kind_check;
update public.athlete_credit_ledger set kind = 'replan' where kind = 'modification';
alter table public.athlete_credit_ledger add constraint athlete_credit_ledger_kind_check
  check (kind in ('confirmation', 'replan', 'coach_credit'));
alter table public.generation_events drop constraint generation_events_counts_as_check;
update public.generation_events set counts_as = 'replan' where counts_as = 'modification';
alter table public.generation_events add constraint generation_events_counts_as_check
  check (counts_as in ('preview', 'confirmation', 'replan'));
alter table public.generation_events drop constraint if exists generation_events_paid_with_check;
alter table public.generation_events add constraint generation_events_paid_with_check
  check (paid_with in ('monthly', 'credit', 'included')); -- included = a re-plan the plan covers

delete from public.app_settings where key in ('app_monthly_modifications', 'extra_modification_pack_size', 'extra_modification_pack_price_aud');
insert into public.app_settings (key, value, description) values
  ('plan_app_weekly_price_aud', 24.95, 'app_weekly: price per week (AUD)'),
  ('plan_app_12wk_price_aud', 239, 'app_12wk: price up front (AUD)'),
  ('plan_coach_run_price_aud', 150, 'coach_run: price per month (AUD)'),
  ('plan_coach_hybrid_price_aud', 250, 'coach_hybrid: price per month (AUD)'),
  ('replan_weekly_every_weeks', 4, 'app_weekly: 1 re-plan per this many paid weeks (the first after that many)'),
  ('replan_12wk_included', 3, 'app_12wk: re-plans included in the 12-week block'),
  ('replan_extra_price_aud', 10, 'Extra re-plan price (AUD)'),
  ('coach_credit_price_aud', 30, 'One coach credit (AUD)'),
  ('coach_credit_cost_reply', 1, 'Coach credits: written reply'),
  ('coach_credit_cost_video', 2, 'Coach credits: short video reply'),
  ('coach_credit_cost_call', 4, 'Coach credits: online Q&A call (max 10 min)')
on conflict (key) do update set value = excluded.value, description = excluded.description;
