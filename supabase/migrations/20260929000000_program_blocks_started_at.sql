-- When the current generation attempt for a block started. Lets the Edge
-- Function spot a block stuck in 'generating' (e.g. after a crash) and allow a
-- retry instead of waiting forever.
alter table public.program_blocks add column started_at timestamptz;
