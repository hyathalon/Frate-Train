-- Migration 8: one race option list, "Hyathlon race" (Open / Pro / Doubles).
-- Other events (Paladin, Deadly Dozen, DEKA, ...) are typed as the optional event
-- name in Program Builder, not offered as list options. The races and station
-- data for them stay; only the Program Builder options go.

delete from public.race_format_options where race_code <> 'H';
