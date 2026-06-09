-- Event audit trail (forward-only logging)
CREATE TABLE IF NOT EXISTS public.event_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text NULL,
  action text NOT NULL,
  entity_type text NULL,
  entity_id text NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  endpoint text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_audit_logs_event_created
  ON public.event_audit_logs (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_event_audit_logs_actor_user
  ON public.event_audit_logs (actor_user_id);

ALTER TABLE public.event_audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs are read-only to authenticated admins/capabilities.
CREATE POLICY "Read event audit logs for event managers"
  ON public.event_audit_logs
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'
      )
      OR EXISTS (
        SELECT 1
        FROM public.event_administrators ea
        WHERE ea.event_id = event_audit_logs.event_id
          AND ea.user_id = auth.uid()
      )
    )
  );

