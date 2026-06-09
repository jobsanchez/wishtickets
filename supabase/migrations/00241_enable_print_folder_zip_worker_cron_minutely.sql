-- Re-enable print-folder ZIP worker cron at a lighter cadence (every minute).
-- Keep the old 30-second delayed cron disabled.

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

SELECT cron.schedule(
  'invoke-print-folder-zip-worker',
  '* * * * *',
  'SELECT public.invoke_print_folder_zip_worker()'
);
