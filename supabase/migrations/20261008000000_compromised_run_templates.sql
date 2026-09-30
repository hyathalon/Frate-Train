-- Migration 12: compromised running sessions (docs/coaching/workout-design/08 §A2b, §A3).
--
-- 1. A "CompromisedRun" part format: running is the main work (uncapped), with
--    station stressors between run segments. The 25% cap stays on "Compromised"
--    (short run segments + station work).
-- 2. compromised_templates: 7 entry-level sessions (first program) and 10
--    standard sessions (2nd program onwards, or 3+ Hyathlon races, or coach choice).
--    Efforts are in the app's scale; stations list the movement patterns allowed.
-- 3. athlete_coach_profiles.compromised_level: the coach's override (entry /
--    standard / auto).

alter table public.session_formats drop constraint session_formats_running_check;
alter table public.session_formats add constraint session_formats_running_check
  check (running in ('none', 'sim', 'capped', 'run', 'uncapped'));

insert into public.session_formats (format, label, dose_kind, score, needs_template, running, rules, description) values
  ('CompromisedRun', 'Compromised run', 'reps', 'none', false, 'uncapped',
   '{"minutes": [20, 60]}',
   'Running under fatigue: run segments at race effort with surges or station stressors between them (08 §A2b/§A3). Uses one compromised template; running uncapped.');

create table public.compromised_templates (
  id text primary key,
  level text not null check (level in ('entry', 'standard')),
  family text not null,
  name text not null,
  main_set text not null,
  rounds text not null,
  stations text[] not null default '{}', -- movement patterns allowed for the stressors ('{}' = running only)
  purpose text not null,
  cue text,
  sort_order int not null
);
alter table public.compromised_templates enable row level security;
create policy "compromised templates read" on public.compromised_templates for select to authenticated using (true);

insert into public.compromised_templates (id, level, family, name, main_set, rounds, stations, purpose, cue, sort_order) values
  -- A2b: entry level (first program). Fast strides RPE 9–9.5; race effort RPE 8–8.5;
  -- slightly faster than race effort RPE 8.5–9; easy jog RPE 5–6.
  ('CR-E1', 'entry', 'Compromised threshold', 'Strides → race effort',
   '[6 × 30 s fast strides (RPE 9–9.5) / 30 s easy jog (RPE 5–6) → 5 min race effort (RPE 8–8.5) → 2 min easy jog]', '2–3', '{}',
   'Hold controlled race effort after surges.', 'Settle fast after the strides.', 1),
  ('CR-E2', 'entry', 'Compromised threshold', 'Strides → slightly faster',
   '[6 × 30 s fast strides (RPE 9–9.5) / 30 s easy jog → 4 min slightly faster than race effort (RPE 8.5–9) → 90 s easy jog]', '3', '{}',
   'Switch quickly between fast running and threshold running without losing rhythm.', null, 2),
  ('CR-E3', 'entry', 'Compromised threshold', 'Short strides → longer race effort',
   '[8 × 20 s fast strides (RPE 9–9.5) / 20 s easy jog → 6 min race effort (RPE 8–8.5), controlled discomfort → 2 min easy jog]', '2–3', '{}',
   'Lactate tolerance and clearance; holding threshold effort when pre-fatigued.', 'Controlled discomfort.', 3),
  ('CR-E4', 'entry', 'Compromised threshold', 'Strides → race effort → push finish',
   '[6 × 30 s fast strides (RPE 9–9.5) / 20 s easy jog → 3 min race effort (RPE 8–8.5) → 2 min slightly faster (RPE 8.5–9), push finish → 2 min easy jog]', '2–3', '{}',
   'Repeat race-style output changes: sprint → hold → recover → repeat.', null, 4),
  ('CR-E5', 'entry', 'Specific compromised threshold', 'Burpees + lunges → race effort',
   '[50 m burpee broad jumps · 30 s easy jog · 50 m walking lunges (no weight) → 5 min race effort to slightly faster (RPE 8–9) → 2 min easy jog]', '3',
   '{"Burpee","Lunge / single-leg"}', 'Run well straight after bodyweight stations.', null, 5),
  ('CR-E6', 'entry', 'Specific compromised threshold', 'Lunges + burpees → race effort',
   '[50 m walking lunges (no weight) · 30 s easy jog · 50 m burpee broad jumps → 5 min race effort (RPE 8–8.5) → 2 min easy jog]', '4',
   '{"Burpee","Lunge / single-leg"}', 'Run well straight after bodyweight stations.', null, 6),
  ('CR-E7', 'entry', 'Specific compromised threshold', 'Lunges + burpees → race effort → faster finish',
   '[50 m walking lunges (no weight) · 30 s easy jog · 50 m burpee broad jumps → 5 min race effort (RPE 8–8.5) → 2 min easy jog → 2 min slightly faster than race effort (RPE 8.5–9)]', '4',
   '{"Burpee","Lunge / single-leg"}', 'Finish faster after bodyweight stations.', null, 7),
  -- A3: standard (2nd program onwards). Race effort RPE 8–8.5; slightly faster RPE 8.5–9;
  -- float RPE 6–7; ~5 km effort / surge RPE 9–9.5; easy RPE 5–6; heavy work by feel.
  ('CR-S1', 'standard', 'Re-composition', 'Clear & Carry',
   '800 m race effort (RPE 8–8.5) · 60 s recovery · 20–30 s surge (RPE 9–9.5) · 60 s race effort · 40–60 m heavy farmer carry (load by feel) · straight into 400 m race effort · 2 min easy (RPE 5–6)', '4–6',
   '{"Carry & grip"}', 'Metabolic load → muscular fatigue → re-establish rhythm.', 'Clear while still moving.', 11),
  ('CR-S2', 'standard', 'Re-composition', 'Redline → Reset → Race',
   '400 m ~5 km effort (RPE 9–9.5) · 200 m very easy · 800 m race effort (RPE 8–8.5) · 60 s easy jog · 400 m race effort · 2 min recovery', '3–5',
   '{}', 'Spike, then regain economy at race effort.', 'Don''t chase the pace. Find the rhythm.', 12),
  ('CR-S3', 'standard', 'Re-composition', 'Broken Race Run',
   '300 m slightly faster than race effort (RPE 8.5–9) · 200 m float (RPE 6–7) · 300 m race effort (RPE 8–8.5) · 200 m float', '6–8',
   '{}', 'Change gears without losing efficiency.', null, 13),
  ('CR-S4', 'standard', 'Re-composition', 'No Free Recovery',
   '1 km race effort (RPE 8–8.5) · 500 m very easy (RPE 5–6) · 1 min sled push/pull (load by feel) · 500 m race effort · 500 m very easy · 1 min SkiErg or row', '4',
   '{"Sled","Erg"}', 'Clear fatigue while still moving.', 'Recovery doesn''t mean stopping.', 14),
  ('CR-S5', 'standard', 'Re-composition', 'Fatigue Sandwich',
   '500 m race effort (RPE 8–8.5) · 30–40 s high-force exercise (load by feel; rotate sled push, farmer carry, wall balls, lunges, SkiErg, burpee broad jumps) · 500 m race effort', '6',
   '{"Sled","Carry & grip","Med ball / throw","Lunge / single-leg","Erg","Burpee"}', 'The first run sets rhythm, the station disrupts, the second tests the rebuild.', null, 15),
  ('CR-S6', 'standard', 'Re-composition', 'Durability Ladder',
   '600 m race effort (RPE 8–8.5) · stressor 30 → 45 → 60 → 75 → 90 s (load by feel) · 600 m race effort', '5',
   '{"Sled","Carry & grip","Med ball / throw","Lunge / single-leg","Erg","Burpee"}', 'How much stress before running deteriorates.', 'Test pace stability; don''t reward faster running.', 16),
  ('CR-S7', 'standard', 'Re-composition', 'Load → Clear → Hold',
   '500 m slightly faster than race effort (RPE 8.5–9) · 500 m race effort (RPE 8–8.5) · 30 s heavy movement (load by feel) · 500 m race effort', '6',
   '{"Sled","Carry & grip","Med ball / throw","Lunge / single-leg"}', 'Settle straight back into economical running.', 'The last 500 m is the test.', 17),
  ('CR-S8', 'standard', 'Re-composition', 'Surge → Settle',
   '1 km: 200 m hard (RPE 9–9.5) · 600 m race effort (RPE 8–8.5) · 200 m hard · 90 s easy jog', '6',
   '{}', 'Spike demand, then settle without a big pace loss.', null, 18),
  ('CR-S9', 'standard', 'Re-composition', 'Fatigue → Clearance → Precision',
   '800 m race effort (RPE 8–8.5) · 40 s wall balls · 400 m race effort · 60 s easy jog · 200 m slightly faster than race effort (RPE 8.5–9)', '4–5',
   '{"Med ball / throw"}', 'Run fast with precision while loaded.', 'Controlled, not sprinting.', 19),
  ('CR-S10', 'standard', 'Re-composition', 'The Echo',
   '800 m race effort (RPE 8–8.5) → 40 s station (rotate sled, burpees, farmer carry, wall balls) → 800 m race effort', '4–6',
   '{"Sled","Burpee","Carry & grip","Med ball / throw"}', 'The first 800 m sets the pace; the second tests whether it comes back.', null, 20);

alter table public.athlete_coach_profiles
  add column compromised_level text not null default 'auto' check (compromised_level in ('entry', 'standard', 'auto'));
