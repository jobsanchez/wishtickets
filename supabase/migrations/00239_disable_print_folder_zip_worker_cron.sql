-- Disable recurring pg_cron triggers for print-folder ZIP worker.
-- ZIP processing is now nudged by the client/API while active.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'invoke-print-folder-zip-worker',
      'invoke-print-folder-zip-worker-30s'
    )
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END $$;
