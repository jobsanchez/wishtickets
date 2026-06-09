-- Allow the ZIP worker to recover jobs stranded in `processing`.
-- A job is lockable when:
--   - status = 'pending', OR
--   - status = 'processing' and no activity for 5+ minutes.

CREATE OR REPLACE FUNCTION public.lock_next_print_folder_zip_job()
RETURNS SETOF public.print_folder_zip_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.print_folder_zip_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now(),
    current_stage = 'processing'
  FROM (
    SELECT j.id
    FROM public.print_folder_zip_jobs j
    WHERE
      j.status = 'pending'
      OR (
        j.status = 'processing'
        AND coalesce(j.last_activity_at, j.updated_at, j.created_at) < now() - interval '5 minutes'
      )
    ORDER BY j.updated_at ASC, j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_next_print_folder_zip_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_next_print_folder_zip_job() TO service_role;
