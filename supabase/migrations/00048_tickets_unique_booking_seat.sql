-- Prevent duplicate seat-based tickets per booking (one ticket per seat per booking)
-- 1. Remove duplicates, keeping one ticket per (booking_id, seat_id)
DELETE FROM public.tickets a
USING public.tickets b
WHERE a.booking_id = b.booking_id
  AND a.seat_id IS NOT NULL
  AND a.seat_id = b.seat_id
  AND a.ctid < b.ctid;

-- 2. Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS tickets_booking_seat_unique
  ON public.tickets (booking_id, seat_id)
  WHERE seat_id IS NOT NULL;
