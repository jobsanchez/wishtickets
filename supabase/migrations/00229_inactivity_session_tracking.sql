-- Inactivity auto-logout session state + admin app_config defaults + pg_cron invoker.

CREATE TABLE IF NOT EXISTS public.user_session_activity (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_in boolean NOT NULL DEFAULT false,
  last_heartbeat_at timestamptz,
  last_activity_at timestamptz,
  has_active_cart boolean NOT NULL DEFAULT false,
  in_paymongo_flow boolean NOT NULL DEFAULT false,
  force_logout boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS user_session_activity_logged_in_idx
  ON public.user_session_activity (logged_in);

CREATE INDEX IF NOT EXISTS user_session_activity_updated_at_idx
  ON public.user_session_activity (updated_at DESC);

ALTER TABLE public.user_session_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own session activity" ON public.user_session_activity;
CREATE POLICY "Users can read own session activity"
ON public.user_session_activity
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own session activity" ON public.user_session_activity;
CREATE POLICY "Users can insert own session activity"
ON public.user_session_activity
FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own session activity" ON public.user_session_activity;
CREATE POLICY "Users can update own session activity"
ON public.user_session_activity
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

INSERT INTO public.app_config (key, value)
VALUES
  ('inactivity_auto_logout_enabled', 'true'::jsonb),
  ('inactivity_auto_logout_minutes', '5'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_inactivity_sweeper_cron()
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
  WHERE d.name = 'inactivity_sweeper_cron_url'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  SELECT trim(d.decrypted_secret)
  INTO bearer
  FROM vault.decrypted_secrets d
  WHERE d.name = 'inactivity_sweeper_cron_bearer'
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF coalesce(job_url, '') = '' OR coalesce(bearer, '') = '' THEN
    RAISE WARNING 'invoke_inactivity_sweeper_cron: missing Vault secrets inactivity_sweeper_cron_url and/or inactivity_sweeper_cron_bearer';
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

REVOKE ALL ON FUNCTION public.invoke_inactivity_sweeper_cron() FROM PUBLIC;

DO $$
BEGIN
  PERFORM cron.unschedule('invoke-inactivity-sweeper');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'invoke-inactivity-sweeper',
  '* * * * *',
  $$SELECT public.invoke_inactivity_sweeper_cron();$$
);
