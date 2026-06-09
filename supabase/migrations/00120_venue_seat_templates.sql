-- Venue seat templates: save and apply seating configuration across events
CREATE TABLE public.venue_seat_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  custom_name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  section_count int NOT NULL DEFAULT 0,
  total_seats int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_venue_seat_templates_venue ON public.venue_seat_templates(venue_id);
CREATE INDEX idx_venue_seat_templates_created_at ON public.venue_seat_templates(created_at DESC);

ALTER TABLE public.venue_seat_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and manage can manage seat templates"
  ON public.venue_seat_templates FOR ALL
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
      OR public.current_user_has_capability('manage_events')
      OR public.current_user_has_capability('manage_seats')
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
      OR public.current_user_has_capability('manage_events')
      OR public.current_user_has_capability('manage_seats')
    )
  );
