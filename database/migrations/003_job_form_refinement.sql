-- ScriptFlow: refined Jobs form fields.
-- Additive migration: existing columns and records are preserved.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS loi text,
  ADD COLUMN IF NOT EXISTS budget numeric(14,2),
  ADD COLUMN IF NOT EXISTS date_sent_to_qa date,
  ADD COLUMN IF NOT EXISTS date_sent_to_pm date,
  ADD COLUMN IF NOT EXISTS changes_time_hours numeric(10,2),
  ADD COLUMN IF NOT EXISTS testing_time_hours numeric(10,2);

COMMENT ON COLUMN public.jobs.budget IS
  'Monetary amount entered without a currency; currency may be populated from SPM later.';
COMMENT ON COLUMN public.jobs.changes_time_hours IS
  'Estimated hours for changes; descriptive notes remain in the existing changes column.';
COMMENT ON COLUMN public.jobs.testing_time_hours IS
  'Estimated hours for testing; descriptive notes remain in the existing testing column.';
COMMENT ON COLUMN public.jobs.hours_worked IS
  'Calculated total: scripting_time_hours + changes_time_hours + testing_time_hours + mailing_time_hours.';

-- This migration deliberately does not rename or drop legacy columns.
-- Primary assignment requirements are enforced in the Jobs form. Existing
-- records may need assignments populated before a database NOT NULL constraint
-- can safely be introduced.
