-- Remove audit trail DB objects and scheduler artifacts.

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-event-audit-logs-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DROP FUNCTION IF EXISTS public.cleanup_old_event_audit_logs();
DROP POLICY IF EXISTS "Read event audit logs for event managers" ON public.event_audit_logs;
DROP TABLE IF EXISTS public.event_audit_logs;

UPDATE public.event_administrators
SET allowed_sections = array_remove(allowed_sections, 'auditTrail')
WHERE allowed_sections IS NOT NULL
  AND 'auditTrail' = ANY (allowed_sections);
