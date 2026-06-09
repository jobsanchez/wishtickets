-- Manual-assignment email sending is now processed directly by app job endpoints.
-- Disable the old pg_cron + pg_net trigger path.

DO $$
BEGIN
  PERFORM cron.unschedule('invoke_manual_assignment_email_jobs_worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.invoke_manual_assignment_email_jobs_worker();
