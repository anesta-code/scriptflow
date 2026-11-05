-- ScriptFlow: archive jobs instead of permanently deleting them.
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS jobs_deleted_at_idx
ON public.jobs (deleted_at);

-- Existing records remain active because deleted_at defaults to NULL.


-- Prevent accidental permanent deletion. Archive by setting deleted_at instead.
CREATE OR REPLACE FUNCTION public.prevent_job_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Jobs cannot be permanently deleted. Set deleted_at to archive the job.';
END;
$$;

DROP TRIGGER IF EXISTS jobs_prevent_hard_delete ON public.jobs;
CREATE TRIGGER jobs_prevent_hard_delete
BEFORE DELETE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_job_hard_delete();
