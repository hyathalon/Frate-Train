-- Migration 17: final pricing (replaces migration 16's plan details). No payments yet.
-- Plans (AUD): app_monthly $75/month (replaces app_weekly; cancel any time, paid to the
-- end of the month; pause stops new plans), app_12wk $149 up front, coach_run $165/month
-- (AI strength program, no coach feedback on strength), coach_hybrid $275/month
-- (coach-reviewed strength + form checks on up to 2 exercises a week).
-- Re-plans: app_monthly 1 per 4 paid weeks (first after 4; no carry-over); app_12wk 3;
-- extra $10; coaching unlimited. Coach credits ($30 each, half units allowed): reply 1,
-- short video 2, extra form checks 1 (up to 2 exercises), Q&A call 3 (up to 20 min),
-- gait analysis 4.5 ($135).

alter table public.athletes drop constraint athletes_plan_check;
update public.athletes set plan = 'app_monthly' where plan = 'app_weekly';
alter table public.athletes add constraint athletes_plan_check
  check (plan in ('app_monthly', 'app_12wk', 'coach_run', 'coach_hybrid'));

-- Half credits: the ledger delta becomes numeric (one decimal).
alter table public.athlete_credit_ledger drop constraint athlete_credit_ledger_delta_check;
alter table public.athlete_credit_ledger alter column delta type numeric(6,1);
alter table public.athlete_credit_ledger add constraint athlete_credit_ledger_delta_check check (delta <> 0);

delete from public.app_settings where key in ('plan_app_weekly_price_aud', 'replan_weekly_every_weeks', 'coach_credit_cost_call');
insert into public.app_settings (key, value, description) values
  ('plan_app_monthly_price_aud', 75, 'app_monthly: price per month (AUD)'),
  ('plan_app_12wk_price_aud', 149, 'app_12wk: price up front (AUD)'),
  ('plan_coach_run_price_aud', 165, 'coach_run: price per month (AUD)'),
  ('plan_coach_hybrid_price_aud', 275, 'coach_hybrid: price per month (AUD)'),
  ('replan_monthly_every_weeks', 4, 'app_monthly: 1 re-plan per this many paid weeks (the first after that many)'),
  ('coach_credit_cost_form_check', 1, 'Coach credits: extra video form checks (up to 2 exercises)'),
  ('coach_credit_cost_call', 3, 'Coach credits: online Q&A call (up to 20 min)'),
  ('coach_credit_cost_gait', 4.5, 'Coach credits: running gait analysis ($135)')
on conflict (key) do update set value = excluded.value, description = excluded.description;
