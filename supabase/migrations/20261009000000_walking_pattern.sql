-- Migration 13: walking is its own movement pattern, not running.
-- No-running athletes are off-feet only, and the home beginner's easy days are a
-- brisk walk (RPE 5–6) and mobility; with walks filed as "Running" they were
-- rejected (and the brisk walk was outdoor-only, hidden from home athletes).
-- Run/walk intervals stay "Running" (they include running).

alter table public.exercises drop constraint exercises_movement_pattern_check;
alter table public.exercises add constraint exercises_movement_pattern_check check (movement_pattern in (
  'Running','Walking','Erg','Squat','Squat-to-press','Hinge','Lunge / single-leg','Upper push','Upper pull',
  'Olympic / power','Carry & grip','Core','Plyometric','Burpee','Crawl','Med ball / throw',
  'Mobility','Sled','Lower leg','Mixed couplet'));

-- Brisk walk: from home or anywhere, bodyweight.
update public.exercises
   set movement_pattern = 'Walking', equipment = 'Bodyweight', equipment_options = '[["Bodyweight"]]'::jsonb,
       where_setting = 'Home or gym', updated_at = now()
 where id = 'EX0497';
update public.exercises set movement_pattern = 'Walking', updated_at = now() where id = 'EX0498'; -- incline treadmill walk
