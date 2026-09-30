-- Migration 11: an emergency stop for Anthropic spend. When 1, generate-program
-- makes no Claude calls: previews, blocks and week rewrites fail cleanly and
-- nothing is counted. Checked before every call, so it also stops a block that
-- is already generating. Used by the capped live tests; can be flipped in the
-- dashboard.
insert into public.app_settings (key, value, description) values
  ('generation_paused', 0, 'Emergency stop: 1 = no Claude calls (generation fails cleanly, nothing counted)')
on conflict (key) do nothing;
