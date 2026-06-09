-- Manual distribution list uses get_admin_seat_assignments → is_authorized_for_event.
-- Admin layout + assignment APIs allow manage_assignments / manage_seats, but those
-- capabilities were not included here, so event-scoped staff saw an empty list while
-- colleagues' assignments existed. Mirror the admin/manage_events path: capability
-- plus an event_administrators row for the event.

CREATE OR REPLACE FUNCTION public.is_authorized_for_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role::text = 'super_admin'
  )
  OR (
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role::text = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id AND ea.user_id = auth.uid()
    )
  )
  OR (
    EXISTS (
      SELECT 1 FROM public.user_capabilities uc2
      WHERE uc2.user_id = auth.uid()
        AND uc2.capability IN ('manage_assignments', 'manage_seats')
    )
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id AND ea.user_id = auth.uid()
    )
  );
$$;
