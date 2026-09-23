-- Program Builder: AI-generated athlete programs + cached reference-doc text.
--
-- Run this in the Supabase SQL editor (or `supabase db push` if the project
-- is linked with the CLI). It is additive only — safe against the existing
-- `programs` / `blocks` / `exercises` tables used by scripts/import-workouts.js.

-- Extra columns on `programs` to carry the athlete brief + raw AI output
-- alongside the curated program library rows.
alter table public.programs
  add column if not exists athlete_name text,
  add column if not exists sessions_per_week int,
  add column if not exists injuries text,
  add column if not exists source text not null default 'manual',
  add column if not exists program_json jsonb;

alter table public.programs
  drop constraint if exists programs_source_check;
alter table public.programs
  add constraint programs_source_check check (source in ('manual', 'ai_generated'));

-- Cached, parsed text of the Hyathlon reference library in assets/hyrox/.
-- Populated by `node scripts/sync-reference-docs.js` (parses PDFs/docx
-- locally, since Edge Functions cannot read the app repo's filesystem).
-- The generate-program Edge Function reads from this table instead of
-- re-parsing the raw files on every request.
create table if not exists public.reference_documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  source_type text not null check (source_type in ('pdf', 'docx')),
  content text not null,
  char_count int not null,
  updated_at timestamptz not null default now()
);

comment on table public.reference_documents is
  'Parsed text of Hyathlon Performance reference docs (assets/hyrox/), used as grounding context for the generate-program Edge Function.';
