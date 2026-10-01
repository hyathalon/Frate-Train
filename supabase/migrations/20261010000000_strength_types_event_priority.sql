-- Migration 14
-- 1. Strength types (docs/coaching/workout-design/09 §7): exercises.strength_types,
--    tagged from movement pattern, methods and name. A first pass for the coach to
--    review. The per-type doses are NOT confirmed yet, so the generator still checks
--    2–3 working sets × 6–10 reps for all strength; the tags aren't used for dosing.
-- 2. A / B / C race priority: events saved in program inputs move from "race it" /
--    "run it as training" to event_priority B / C (the goal event is A by default).

alter table public.exercises add column strength_types text[] not null default '{}'
  check (strength_types <@ array['general', 'hypertrophy', 'maximal', 'explosive', 'reactive', 'isometric', 'strength_endurance']::text[]);

-- General strength and general strength / hypertrophy: the strength-method lifts.
update public.exercises set strength_types = array['general', 'hypertrophy']
 where 'Strength' = any(methods)
   and movement_pattern in ('Squat', 'Hinge', 'Lunge / single-leg', 'Upper push', 'Upper pull', 'Squat-to-press', 'Lower leg', 'Core');

-- Maximal: heavy compound lifts.
update public.exercises set strength_types = array_append(strength_types, 'maximal')
 where movement_pattern in ('Squat', 'Hinge', 'Upper push', 'Upper pull')
   and name ~* '(back squat|front squat|deadlift|trap.?bar|bench press|weighted (pull|chin)|heavy)';

-- Explosive / power: Olympic lifts, throws, jumps, swings, sprints.
update public.exercises set strength_types = array_append(strength_types, 'explosive')
 where movement_pattern in ('Olympic / power', 'Med ball / throw')
    or (movement_pattern not in ('Erg', 'Running', 'Walking', 'Mobility', 'Plyometric')
        and name ~* '(jump squat|throw|slam|swing|broad jump|sprint|push press|clean|snatch|explosive)');

-- Reactive (plyometric).
update public.exercises set strength_types = array_append(strength_types, 'reactive')
 where movement_pattern = 'Plyometric' or 'Plyometric' = any(methods);

-- Isometric: holds, planks, wall sits, hangs.
update public.exercises set strength_types = array_append(strength_types, 'isometric')
 where movement_pattern not in ('Erg', 'Running', 'Walking', 'Mobility')
   and name ~* '(hold|plank|wall sit|dead hang|\mhang\M|isometric|\miso\M)';

-- Strength endurance: race stations and loaded carries.
update public.exercises set strength_types = array_append(strength_types, 'strength_endurance')
 where movement_pattern in ('Sled', 'Burpee', 'Carry & grip', 'Mixed couplet')
    or name ~* '(wall ball|sandbag|farmer)';

update public.exercises set strength_types = array(select distinct unnest(strength_types) order by 1), updated_at = now()
 where strength_types <> '{}';

-- Saved events: "race it" → B, "run it as training" → C.
update public.training_programs p
   set inputs = jsonb_set(p.inputs, '{other_events}', (
     select coalesce(jsonb_agg(
       (e - 'mode') || jsonb_build_object('event_priority', coalesce(e->>'event_priority', case e->>'mode' when 'race' then 'B' else 'C' end))
     ), '[]'::jsonb)
     from jsonb_array_elements(p.inputs->'other_events') e))
 where jsonb_typeof(p.inputs->'other_events') = 'array';
