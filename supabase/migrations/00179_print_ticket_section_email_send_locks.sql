-- Prevent duplicate section-email sends from repeated clicks/retries.
-- One lock key per (event, section, recipients, time bucket).

CREATE TABLE IF NOT EXISTS public.print_ticket_section_email_send_locks (
  idempotency_key text PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_section_id uuid NOT NULL REFERENCES public.event_sections(id) ON DELETE CASCADE,
  recipient_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_print_ticket_section_email_send_locks_created_at
  ON public.print_ticket_section_email_send_locks(created_at);

ALTER TABLE public.print_ticket_section_email_send_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage print_ticket_section_email_send_locks"
  ON public.print_ticket_section_email_send_locks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_assignments'))
  );
