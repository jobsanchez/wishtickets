-- Track when confirmation email was sent for idempotency (avoid duplicates on page refresh)
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS ticket_email_sent_at timestamptz;

COMMENT ON COLUMN public.bookings.ticket_email_sent_at IS 'When the ticket/confirmation email was sent; used to avoid sending duplicates';
