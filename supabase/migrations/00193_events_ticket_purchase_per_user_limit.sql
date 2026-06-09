ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS ticket_purchase_per_user integer NOT NULL DEFAULT 0;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_ticket_purchase_per_user_non_negative;

ALTER TABLE public.events
ADD CONSTRAINT events_ticket_purchase_per_user_non_negative
CHECK (ticket_purchase_per_user >= 0);
