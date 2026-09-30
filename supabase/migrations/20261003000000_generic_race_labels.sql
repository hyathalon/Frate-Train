-- Migration 7: general race labels (no event brand names in the app).
-- The event name stays optional free text in Program Builder.

update public.races set name = 'Hyathlon race' where code = 'H';

alter table public.race_format_options add column note text;

update public.race_format_options
   set id = 'hyathlon-open', label = 'Hyathlon race – Open'
 where id = 'hyrox-open';

update public.race_format_options set sort_order = sort_order + 2 where race_code <> 'H';

insert into public.race_format_options (id, race_code, format, label, run_distance_m, sort_order, is_default, note) values
  ('hyathlon-pro', 'H', 'Open', 'Hyathlon race – Pro', 1000, 2, false, 'Heavier station standards than Open.'),
  ('hyathlon-doubles', 'H', 'Open', 'Hyathlon race – Doubles', 1000, 3, false,
   'Two athletes share the station work; both run every run segment.');

alter table public.athletes alter column athlete_type set default 'hyathlon';
update public.athletes set athlete_type = 'hyathlon' where athlete_type = 'hyrox';

-- Programs keep their Program Builder answers, including the race option id.
update public.training_programs
   set inputs = jsonb_set(inputs, '{race_option_id}', '"hyathlon-open"')
 where inputs->>'race_option_id' = 'hyrox-open';
