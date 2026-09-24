-- Rename the per-block `exercises` table to `program_exercises` so the
-- Hyathlon exercise library (next migration) can own `public.exercises`.
--
-- Postgres keeps constraint and index names on rename, so `exercises_pkey`,
-- `exercises_block_id_fkey` etc. are renamed too — otherwise the library
-- table's constraints would collide with them.

alter table public.exercises rename to program_exercises;

do $$
declare r record;
begin
  -- Constraints first (renaming a pk/unique constraint also renames its index).
  for r in
    select conname from pg_constraint
    where conrelid = 'public.program_exercises'::regclass and conname like 'exercises\_%'
  loop
    execute format('alter table public.program_exercises rename constraint %I to %I',
                   r.conname, 'program_' || r.conname);
  end loop;

  -- Any remaining standalone indexes.
  for r in
    select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
    where i.indrelid = 'public.program_exercises'::regclass and c.relname like 'exercises\_%'
  loop
    execute format('alter index public.%I rename to %I', r.relname, 'program_' || r.relname);
  end loop;
end $$;
