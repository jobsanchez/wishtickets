-- Reschedule recurring maintenance cron jobs:
-- - inactivity sweeper: every 30 minutes
-- - stale pending payments cleanup: every 1 hour

DO $$
BEGIN
  PERFORM cron.unschedule('invoke-inactivity-sweeper');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'invoke-inactivity-sweeper',
  '*/30 * * * *',
  $$SELECT public.invoke_inactivity_sweeper_cron();$$
);

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-pending-payments');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-pending-payments',
  '0 * * * *',
  'SELECT public.cleanup_stale_pending_payments()'
);
