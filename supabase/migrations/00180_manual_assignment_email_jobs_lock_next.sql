CREATE OR REPLACE FUNCTION public.lock_next_manual_assignment_email_job()
RETURNS SETOF public.manual_assignment_email_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.manual_assignment_email_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now()
  FROM (
    SELECT j.id
    FROM public.manual_assignment_email_jobs j
    WHERE (
        j.status = 'pending'
        OR (j.status = 'processing' AND j.last_activity_at < now() - interval '5 minutes')
      )
      AND j.status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY j.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_next_manual_assignment_email_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_next_manual_assignment_email_job() TO service_role;
