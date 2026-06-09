CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_manual_assignment_email_jobs_worker()
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
  WHERE d.name = 'manual_assignment_email_jobs_worker_url'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT trim(d.decrypted_secret)
    INTO bearer
  FROM vault.decrypted_secrets d
  WHERE d.name = 'manual_assignment_email_jobs_worker_bearer'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF coalesce(worker_url, '') = '' OR coalesce(bearer, '') = '' THEN
    RAISE NOTICE 'Skipping manual-assignment-email worker invoke; missing url or bearer secret.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_manual_assignment_email_jobs_worker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_manual_assignment_email_jobs_worker() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('invoke_manual_assignment_email_jobs_worker');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'invoke_manual_assignment_email_jobs_worker',
  '*/1 * * * *',
  $$SELECT public.invoke_manual_assignment_email_jobs_worker();$$
);
