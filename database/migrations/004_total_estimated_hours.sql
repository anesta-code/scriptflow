-- ScriptFlow migration 004: store estimated hours separately from actual hours worked.
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS total_estimated_hours numeric(10,2);
