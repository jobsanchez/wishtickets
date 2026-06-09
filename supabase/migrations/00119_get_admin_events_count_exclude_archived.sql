-- Admin dashboard Events card: exclude archived and cancelled from count
CREATE OR REPLACE FUNCTION public.get_admin_events_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events e
  WHERE (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  OR (
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (SELECT 1 FROM public.event_administrators ea WHERE ea.event_id = e.id AND ea.user_id = auth.uid())
  )
  AND (e.status IS NULL OR LOWER(e.status) NOT IN ('archived', 'cancelled'));
$$;
