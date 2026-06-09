-- Retain event audit trail entries for 7 days, then purge daily.

CREATE OR REPLACE FUNCTION public.cleanup_old_event_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.event_audit_logs
  WHERE created_at < now() - interval '7 days';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_event_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_event_audit_logs() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-event-audit-logs-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-old-event-audit-logs-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_old_event_audit_logs();$$
);
