-- Re-apply finalize-friendly lock (after 00169 cursor-only): one more tick when cursor = total but email not sent yet.

CREATE OR REPLACE FUNCTION public.lock_print_ticket_email_job_by_id_for_creator(
  p_job_id uuid,
  p_user_id uuid
)
RETURNS SETOF public.print_ticket_email_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.print_ticket_email_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now()
  FROM (
    SELECT j.id
    FROM public.print_ticket_email_jobs j
    WHERE j.id = p_job_id
      AND j.created_by = p_user_id
      AND (
        j.status = 'pending'
        OR (j.status = 'processing' AND COALESCE(j.email_finalized, false) = false)
      )
      AND j.status NOT IN ('completed', 'failed', 'cancelled')
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

CREATE OR REPLACE FUNCTION public.lock_next_print_ticket_email_job()
RETURNS SETOF public.print_ticket_email_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.print_ticket_email_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now()
  FROM (
    SELECT j.id
    FROM public.print_ticket_email_jobs j
    WHERE (
        j.status = 'pending'
        OR (j.status = 'processing' AND COALESCE(j.email_finalized, false) = false)
      )
      AND j.status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY j.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_print_ticket_email_job_by_id_for_creator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_print_ticket_email_job_by_id_for_creator(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.lock_next_print_ticket_email_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_next_print_ticket_email_job() TO service_role;
