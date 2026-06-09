-- Legacy manual-assignment ticket image cron is obsolete.
-- New flow runs via app-driven job endpoints; keep logs clean by removing stale cron + function.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'invoke_manual_assignment_ticket_gen_worker',
      'invoke-manual-assignment-ticket-gen-worker'
    )
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.invoke_manual_assignment_ticket_gen_worker();
