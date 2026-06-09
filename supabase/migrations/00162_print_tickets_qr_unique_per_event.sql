-- QR payload can repeat across different events (same event_code + section_code + row/seat).
-- Replace global uniqueness with per-event uniqueness so print generation does not fail
-- with duplicate key on idx_print_tickets_qr_data.

DROP INDEX IF EXISTS public.idx_print_tickets_qr_data;

CREATE UNIQUE INDEX idx_print_tickets_event_qr_data
  ON public.print_tickets(event_id, qr_data);
