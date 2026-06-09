-- Ticket image batch (manual confirm) loads events.* for templates; confirm route
-- ignored missing event rows. Capability users (manage_seats / manage_assignments)
-- could confirm draft events then fail on generate-images with PGRST116 / "Event not found".

DROP POLICY IF EXISTS "Staff can read events" ON public.events;

CREATE POLICY "Staff can read events" ON public.events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (
      SELECT 1
      FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid()
        AND uc.capability IN ('manage_seats', 'manage_assignments', 'manage_events')
    )
  );
