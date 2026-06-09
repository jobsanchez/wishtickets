-- Count of archived events for admin dashboard (same auth as get_admin_events_count)
CREATE OR REPLACE FUNCTION public.get_admin_archived_events_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events e
  WHERE e.status = 'archived'
  AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'super_admin')
    OR (
      (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role::text = 'admin')
       OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
      AND EXISTS (SELECT 1 FROM public.event_administrators ea WHERE ea.event_id = e.id AND ea.user_id = auth.uid())
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_archived_events_count() TO authenticated;
