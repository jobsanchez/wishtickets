-- Daily storage orphan cleanup: invoke Next.js route that deletes unreferenced Storage objects.
-- Mirrors pg_net patterns used for other HTTP workers (see 00164_print_ticket_email_jobs_pg_net_cron.sql).
--
-- Prerequisites:
--   - Dashboard → Database → Extensions: **pg_cron**, **pg_net**, **Vault** (secrets).
--   - Hosted app env: **CRON_SECRET**, **SUPABASE_SERVICE_ROLE_KEY**, **NEXT_PUBLIC_SUPABASE_URL**.
--
-- After applying this migration, create Vault secrets (SQL Editor or Dashboard → Vault):
--
--   SELECT vault.create_secret(
--     'https://YOUR_SITE.example/api/cron/storage-orphans-delete',
--     'storage_orphans_cron_url',
--     'GET/POST target; optional ?bucket=ticket-images (recommended for large buckets)'
--   );
--   SELECT vault.create_secret(
--     'YOUR_CRON_SECRET',
--     'storage_orphans_cron_bearer',
--     'Must match CRON_SECRET on the Next.js host'
--   );
--
-- Default URL with no query processes **all** allow-listed buckets sequentially (may exceed server timeout).
-- Prefer adding ?bucket=ticket-images (or run separate cron jobs per bucket with distinct Vault URLs).
--
-- Until both secrets exist, the job no-ops with WARNING in Postgres logs.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_storage_orphans_delete_cron()
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
  WHERE d.name = 'storage_orphans_cron_url'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT trim(d.decrypted_secret)
  INTO bearer
  FROM vault.decrypted_secrets d
  WHERE d.name = 'storage_orphans_cron_bearer'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF coalesce(job_url, '') = '' OR coalesce(bearer, '') = '' THEN
    RAISE WARNING 'invoke_storage_orphans_delete_cron: missing Vault secrets storage_orphans_cron_url and/or storage_orphans_cron_bearer';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := job_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_storage_orphans_delete_cron() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('invoke-storage-orphans-delete-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 08:00 UTC daily
SELECT cron.schedule(
  'invoke-storage-orphans-delete-daily',
  '0 8 * * *',
  $$SELECT public.invoke_storage_orphans_delete_cron();$$
);
