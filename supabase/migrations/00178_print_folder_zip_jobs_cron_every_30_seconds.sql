-- Run ZIP worker every ~30 seconds using two pg_cron jobs:
-- - one immediate at the start of each minute
-- - one delayed by 30 seconds within the same minute

CREATE OR REPLACE FUNCTION public.invoke_print_folder_zip_worker_delayed_30s()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_sleep(30);
  PERFORM public.invoke_print_folder_zip_worker();
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_print_folder_zip_worker_delayed_30s() FROM PUBLIC;

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

SELECT cron.schedule(
  'invoke-print-folder-zip-worker-30s',
  '* * * * *',
  'SELECT public.invoke_print_folder_zip_worker_delayed_30s()'
);
