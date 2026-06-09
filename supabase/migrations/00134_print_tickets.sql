-- Print tickets: generated ticket images for sections/seats without sale or reservation.
-- Used solely for printing and email distribution.

CREATE TABLE IF NOT EXISTS public.print_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_section_id uuid NOT NULL REFERENCES public.event_sections(id) ON DELETE CASCADE,
  event_seat_id uuid REFERENCES public.event_seats(id) ON DELETE CASCADE,
  ticket_image_url text,
  qr_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One print ticket per seat (assigned seating)
CREATE UNIQUE INDEX idx_print_tickets_section_seat
  ON public.print_tickets(event_section_id, event_seat_id)
  WHERE event_seat_id IS NOT NULL;

-- One print ticket per section (free/standing)
CREATE UNIQUE INDEX idx_print_tickets_section_only
  ON public.print_tickets(event_section_id)
  WHERE event_seat_id IS NULL;

CREATE UNIQUE INDEX idx_print_tickets_qr_data ON public.print_tickets(qr_data);
CREATE INDEX idx_print_tickets_event ON public.print_tickets(event_id);

ALTER TABLE public.print_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage print_tickets"
  ON public.print_tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_assignments'))
  );

-- Audit log for print ticket email sends
CREATE TABLE IF NOT EXISTS public.print_ticket_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  print_ticket_id uuid NOT NULL REFERENCES public.print_tickets(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_ticket_emails_print_ticket ON public.print_ticket_emails(print_ticket_id);

ALTER TABLE public.print_ticket_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage print_ticket_emails"
  ON public.print_ticket_emails
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_assignments'))
  );
