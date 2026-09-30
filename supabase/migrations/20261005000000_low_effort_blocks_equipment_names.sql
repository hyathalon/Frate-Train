-- Migration 9
-- 1. Block calls run at low effort for everyone (live test 30 Sep 2026: medium
--    effort ran out of output on a single week; low effort was 3–4x faster).
-- 2. Equipment names for onboarding Q11–Q13: Smith machine and Bike become
--    library names, and pool swimming is split from pool (aqua) running.

update public.ai_call_models
   set effort_member = 'low', effort_other = 'low', updated_at = now()
 where call_type in ('confirmation_block', 'next_block', 'hold_block');

-- Bike (indoor or outdoor): an alternative for the steady, tempo and interval
-- BikeErg sessions (not the BikeErg set-up, damper or watts-target drills).
update public.exercises
   set equipment_options = equipment_options || '[["Bike"]]'::jsonb,
       equipment = equipment || ' or bike',
       updated_at = now()
 where id in ('EX0012', 'EX0146', 'EX0148', 'EX0149', 'EX0150', 'EX0154', 'EX0155', 'EX0158', 'EX0159',
              'EX0160', 'EX0161', 'EX0162', 'EX0163', 'EX0164', 'EX0165', 'EX0167')
   and not equipment_options @> '[["Bike"]]'::jsonb;

-- Smith machine: an alternative for back squats and barbell bench presses.
update public.exercises
   set equipment_options = equipment_options || '[["Smith machine"]]'::jsonb,
       equipment = equipment || ' or Smith machine',
       updated_at = now()
 where id in ('EX0144', 'EX0216', 'EX0217')
   and not equipment_options @> '[["Smith machine"]]'::jsonb;
update public.exercises
   set equipment_options = equipment_options || '[["Smith machine", "Bench"]]'::jsonb,
       equipment = equipment || ' or Smith machine',
       updated_at = now()
 where id in ('EX0447', 'EX0450')
   and not equipment_options @> '[["Smith machine", "Bench"]]'::jsonb;

-- Pool: aqua (deep-water) running is off-feet cross-training, not running.
update public.exercises
   set equipment_options = '[["Pool (aqua running)"]]'::jsonb,
       equipment = 'Pool (aqua running)',
       movement_pattern = 'Erg',
       updated_at = now()
 where id = 'EX0030';

-- Pool: swimming.
insert into public.exercises
  (id, name, movement_pattern, equipment, equipment_options, primary_pillar, secondary_pillar, where_setting, best_with,
   methods, difficulty, acute_risk, body_region, tabata_suitable)
values
  ('EX0553', 'Easy swim', 'Erg', 'Pool (swimming)', '[["Pool (swimming)"]]', 'Aerobic Engine', 'Fatigue Management', 'Gym', 'Solo OK',
   array['Aerobic'], 'Beginner', 'Low', 'Cardio', false),
  ('EX0554', 'Swim aerobic intervals', 'Erg', 'Pool (swimming)', '[["Pool (swimming)"]]', 'Aerobic Engine', null, 'Gym', 'Solo OK',
   array['Aerobic'], 'Beginner', 'Low', 'Cardio', false),
  ('EX0555', 'Swim threshold intervals', 'Erg', 'Pool (swimming)', '[["Pool (swimming)"]]', 'Threshold', null, 'Gym', 'Solo OK',
   array['Conditioning'], 'Intermediate', 'Low', 'Cardio', false);
