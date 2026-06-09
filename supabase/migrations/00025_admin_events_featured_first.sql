-- Sort featured events first, then by date within each group
CREATE OR REPLACE FUNCTION public.get_admin_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.*
  FROM public.events e
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'
  )
  ORDER BY e.featured DESC NULLS LAST, e.event_start ASC;
$$;
