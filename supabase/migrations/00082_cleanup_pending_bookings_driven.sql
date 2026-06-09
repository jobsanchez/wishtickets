-- Add booking-driven cleanup alongside payment-driven. Both run in the same function.
-- Pass 1: Payment-driven (existing) - payments pending/failed > 3 min
-- Pass 2: Booking-driven (new) - bookings pending > 3 min (catches orphans, edge cases)

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
  -- Pass 1: Payment-driven - payments pending/failed older than 3 minutes
  FOR r IN
    SELECT p.id AS payment_id, p.booking_id
    FROM public.payments p
    WHERE p.status IN ('pending', 'failed')
      AND (p.created_at IS NULL OR p.created_at < now() - interval '3 minutes')
  LOOP
    -- Get seat_ids from tickets (before deleting)
    SELECT array_agg(seat_id) INTO seat_ids
    FROM public.tickets
    WHERE booking_id = r.booking_id AND seat_id IS NOT NULL;

    -- Delete tickets
    DELETE FROM public.tickets WHERE booking_id = r.booking_id;

    -- Release seats
    IF seat_ids IS NOT NULL AND array_length(seat_ids, 1) > 0 THEN
      UPDATE public.event_seats SET status = 'available' WHERE id = ANY(seat_ids);
    END IF;

    -- Update booking to failed (only if still pending)
    UPDATE public.bookings SET status = 'failed' WHERE id = r.booking_id AND status = 'pending';

    -- Update payment to failed
    UPDATE public.payments SET status = 'failed' WHERE id = r.payment_id;

    -- Delete payment and booking
    DELETE FROM public.payments WHERE id = r.payment_id;
    DELETE FROM public.bookings WHERE id = r.booking_id;
  END LOOP;

  -- Pass 2: Booking-driven - bookings pending older than 3 minutes (orphans, edge cases)
  FOR r IN
    SELECT b.id AS booking_id
    FROM public.bookings b
    WHERE b.status = 'pending'
      AND (b.created_at IS NULL OR b.created_at < now() - interval '3 minutes')
  LOOP
    -- Get seat_ids from tickets (before deleting)
    SELECT array_agg(seat_id) INTO seat_ids
    FROM public.tickets
    WHERE booking_id = r.booking_id AND seat_id IS NOT NULL;

    -- Delete tickets
    DELETE FROM public.tickets WHERE booking_id = r.booking_id;

    -- Release seats
    IF seat_ids IS NOT NULL AND array_length(seat_ids, 1) > 0 THEN
      UPDATE public.event_seats SET status = 'available' WHERE id = ANY(seat_ids);
    END IF;

    -- Update payment to failed (if exists)
    UPDATE public.payments SET status = 'failed' WHERE booking_id = r.booking_id;

    -- Delete payment and booking
    DELETE FROM public.payments WHERE booking_id = r.booking_id;
    DELETE FROM public.bookings WHERE id = r.booking_id;
  END LOOP;
END;
$$;
