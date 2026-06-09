-- Async print-ticket email jobs: ping the Next.js cron route from Supabase (pg_cron + pg_net).
-- Schedule + helper are dropped by migration `00165_remove_print_ticket_email_jobs_pg_net_cron.sql` when you move to the browser-driven worker.
-- Prereqs (Dashboard → Database → Extensions): enable **pg_cron** (if not already) and **pg_net**.
--
-- After this migration, add two Vault secrets (SQL Editor or Dashboard → Vault). Use the same
-- bearer value as `CRON_SECRET` on your host (e.g. Netlify). URL must be the full cron path:
--
--   SELECT vault.create_secret(
--     'https://YOUR_SITE.netlify.app/api/cron/print-ticket-email-jobs',
--     'print_ticket_email_jobs_cron_url',
--     'POST target for print ticket email job worker'
--   );
--   SELECT vault.create_secret(
--     'YOUR_CRON_SECRET',
--     'print_ticket_email_jobs_cron_bearer',
--     'Bearer token; must match CRON_SECRET on the Next app'
--   );
--
-- Until both exist, the cron job no-ops with a WARNING in Postgres logs.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_print_ticket_email_jobs_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_url text;
  bearer text;
BEGIN
  SELECT trim(d.decrypted_secret)
  INTO job_url
  FROM vault.decrypted_secrets d
  WHERE d.name = 'print_ticket_email_jobs_cron_url'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT trim(d.decrypted_secret)
  INTO bearer
  FROM vault.decrypted_secrets d
  WHERE d.name = 'print_ticket_email_jobs_cron_bearer'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF coalesce(job_url, '') = '' OR coalesce(bearer, '') = '' THEN
    RAISE WARNING 'invoke_print_ticket_email_jobs_cron: missing Vault secrets print_ticket_email_jobs_cron_url and/or print_ticket_email_jobs_cron_bearer';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := job_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_print_ticket_email_jobs_cron() FROM PUBLIC;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT jobid FROM cron.job WHERE jobname = 'invoke-print-ticket-email-jobs'
  LOOP
    PERFORM cron.unschedule(rec.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'invoke-print-ticket-email-jobs',
  '* * * * *',
  'SELECT public.invoke_print_ticket_email_jobs_cron()'
);
