-- Minute cron for section ZIP prebuild worker (Supabase Edge Function).
-- Required Vault secrets:
--   print_folder_zip_worker_url       -> https://<project-ref>.supabase.co/functions/v1/print-folder-zip-worker
--   print_folder_zip_worker_bearer    -> value of PRINT_FOLDER_ZIP_WORKER_SECRET configured on the Edge Function

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_print_folder_zip_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  worker_url text;
  bearer text;
BEGIN
  SELECT trim(d.decrypted_secret)
  INTO worker_url
  FROM vault.decrypted_secrets d
  WHERE d.name = 'print_folder_zip_worker_url'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT trim(d.decrypted_secret)
  INTO bearer
  FROM vault.decrypted_secrets d
  WHERE d.name = 'print_folder_zip_worker_bearer'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF coalesce(worker_url, '') = '' OR coalesce(bearer, '') = '' THEN
    RAISE WARNING 'invoke_print_folder_zip_worker: missing Vault secret(s) print_folder_zip_worker_url and/or print_folder_zip_worker_bearer';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_print_folder_zip_worker() FROM PUBLIC;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT jobid FROM cron.job WHERE jobname = 'invoke-print-folder-zip-worker'
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'invoke-print-folder-zip-worker',
  '* * * * *',
  'SELECT public.invoke_print_folder_zip_worker()'
);
