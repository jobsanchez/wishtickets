CREATE TABLE IF NOT EXISTS public.shared_report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date_from date,
  date_to date,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_shared_report_links_token
  ON public.shared_report_links(token);

CREATE INDEX IF NOT EXISTS idx_shared_report_links_expires_at
  ON public.shared_report_links(expires_at);

ALTER TABLE public.shared_report_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage shared_report_links" ON public.shared_report_links;
CREATE POLICY "Admins can manage shared_report_links"
  ON public.shared_report_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid()
        AND uc.capability = 'view_sales_analytics'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role::text IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid()
        AND uc.capability = 'view_sales_analytics'
    )
  );

DROP POLICY IF EXISTS "Public can read valid shared_report_links" ON public.shared_report_links;
CREATE POLICY "Public can read valid shared_report_links"
  ON public.shared_report_links
  FOR SELECT
  TO anon, authenticated
  USING (
    revoked_at IS NULL
    AND expires_at > now()
  );

CREATE OR REPLACE FUNCTION public.get_shared_dashboard_metrics(
  p_event_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_effective_user uuid;
BEGIN
  v_effective_user := COALESCE(p_actor_user_id, auth.uid());
  IF v_effective_user IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_effective_user::text, true);
  END IF;

  RETURN public.get_admin_dashboard_metrics(p_event_id, p_date_from, p_date_to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_dashboard_metrics(uuid, date, date, uuid) TO anon, authenticated;
