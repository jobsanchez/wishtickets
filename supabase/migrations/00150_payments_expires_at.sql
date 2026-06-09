-- Align pending payment timeout with reservation/cart expiry.
-- Stores payment deadline directly on payments so backend checks and cleanup use one source.

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Best-effort backfill for legacy pending rows created before this column existed.
-- Uses 15 minutes from payment creation as fallback baseline.
UPDATE public.payments
SET expires_at = created_at + interval '15 minutes'
WHERE expires_at IS NULL
  AND status = 'pending'
  AND created_at IS NOT NULL;

-- Re-align cleanup function to use payment deadline (expires_at) instead of fixed 3 minutes.
CREATE OR REPLACE FUNCTION public.cleanup_stale_pending_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  seat_ids uuid[];
BEGIN
  -- Pass 1: Payment-driven - pending/failed past payment expiry.
  FOR r IN
    SELECT p.id AS payment_id, p.booking_id
    FROM public.payments p
    WHERE p.status IN ('pending', 'failed')
      AND COALESCE(
        p.expires_at,
        CASE WHEN p.created_at IS NOT NULL THEN p.created_at + interval '15 minutes' END
      ) < now()
  LOOP
    SELECT array_agg(seat_id) INTO seat_ids
    FROM public.tickets
    WHERE booking_id = r.booking_id AND seat_id IS NOT NULL;

    DELETE FROM public.tickets WHERE booking_id = r.booking_id;

    IF seat_ids IS NOT NULL AND array_length(seat_ids, 1) > 0 THEN
      UPDATE public.event_seats SET status = 'available' WHERE id = ANY(seat_ids);
    END IF;

    UPDATE public.bookings SET status = 'failed' WHERE id = r.booking_id AND status = 'pending';
    UPDATE public.payments SET status = 'failed' WHERE id = r.payment_id;

    DELETE FROM public.payments WHERE id = r.payment_id;
    DELETE FROM public.bookings WHERE id = r.booking_id;
  END LOOP;

  -- Pass 2: Booking-driven fallback for rare pending bookings without payment rows.
  FOR r IN
    SELECT b.id AS booking_id
    FROM public.bookings b
    WHERE b.status = 'pending'
      AND b.created_at < now() - interval '15 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p WHERE p.booking_id = b.id
      )
  LOOP
    SELECT array_agg(seat_id) INTO seat_ids
    FROM public.tickets
    WHERE booking_id = r.booking_id AND seat_id IS NOT NULL;

    DELETE FROM public.tickets WHERE booking_id = r.booking_id;

    IF seat_ids IS NOT NULL AND array_length(seat_ids, 1) > 0 THEN
      UPDATE public.event_seats SET status = 'available' WHERE id = ANY(seat_ids);
    END IF;

    UPDATE public.bookings SET status = 'failed' WHERE id = r.booking_id;
    DELETE FROM public.bookings WHERE id = r.booking_id;
  END LOOP;
END;
$$;
