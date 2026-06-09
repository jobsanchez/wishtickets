-- Remove scheduled HTTP ping for print-ticket email jobs (browser-driven worker instead).

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT jobid FROM cron.job WHERE jobname = 'invoke-print-ticket-email-jobs'
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.invoke_print_ticket_email_jobs_cron();
