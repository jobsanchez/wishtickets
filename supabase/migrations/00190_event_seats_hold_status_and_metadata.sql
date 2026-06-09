ALTER TABLE public.event_seats
DROP CONSTRAINT IF EXISTS event_seats_status_check;

ALTER TABLE public.event_seats
ADD CONSTRAINT event_seats_status_check
CHECK (status IN ('available', 'reserved', 'sold', 'hold'));

ALTER TABLE public.event_seats
ADD COLUMN IF NOT EXISTS hold_batch_id uuid,
ADD COLUMN IF NOT EXISTS hold_description text,
ADD COLUMN IF NOT EXISTS hold_created_at timestamptz;
