-- Migration 10: week adjustments and replans run at low effort too (coach decision,
-- 30 Sep 2026), like block calls since migration 9.

update public.ai_call_models
   set effort_member = 'low', effort_other = 'low', updated_at = now()
 where call_type in ('week_adjust', 'replan');
