-- Follow-up after the Sydney move.
-- (20260925040000 is reserved for Part 4, which is on hold.)

-- a) Row level security on hyathlon_reference.
-- Only the generate-program Edge Function and scripts/seed-hyathlon-reference.js
-- use this table, both with the service role key (which bypasses RLS). The app
-- never reads it with the anon key, so no policies: anon and authenticated
-- users get no access at all.
alter table public.hyathlon_reference enable row level security;

-- b) Reword the care_team guidance row: no third parties.
update public.rehab_global_guidance
   set title = 'Your rehab plan',
       items = array[
         'You can add exercises your physio or doctor gives you to your own plan in the app.',
         'Your plan and logs are private to you. The app doesn''t send them to anyone.',
         'Always follow your medical professional''s advice. If anything here differs from what they''ve told you, go with them.'
       ]::text[]
 where key = 'care_team';

do $$
begin
  if not exists (select 1 from public.rehab_global_guidance where key = 'care_team' and title = 'Your rehab plan') then
    raise exception 'care_team guidance row not found';
  end if;
end $$;
