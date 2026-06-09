ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS encrypted_qr text;

ALTER TABLE public.print_tickets
ADD COLUMN IF NOT EXISTS encrypted_qr text;

CREATE INDEX IF NOT EXISTS idx_tickets_encrypted_qr
ON public.tickets (encrypted_qr);

CREATE INDEX IF NOT EXISTS idx_print_tickets_event_encrypted_qr
ON public.print_tickets (event_id, encrypted_qr);
