-- Migration 6: a Run format for athletes who choose "Program my running", and
-- shorter Station and Compromised parts (5 minutes minimum).
--
-- The athlete's running choice lives in training_programs.inputs.running:
--   programmed – we plan running (Run parts: key, easy, long or recovery runs)
--   own_plan   – they follow their own run plan; we plan around their run days
--   none       – no running beyond race simulations and compromised parts

alter table public.session_formats drop constraint session_formats_running_check;
alter table public.session_formats add constraint session_formats_running_check
  check (running in ('none', 'sim', 'capped', 'run'));

insert into public.session_formats (format, label, dose_kind, score, needs_template, running, rules, description) values
  ('Run', 'Run', 'time', 'none', false, 'run',
   '{"minutes": [10, 120]}',
   'A programmed run (key, easy, long or recovery) by time and RPE, with distance only for reps. Only when the athlete chose "Program my running".');

update public.session_formats set rules = jsonb_set(rules, '{minutes}', '[5, 60]') where format in ('Station', 'Compromised');
