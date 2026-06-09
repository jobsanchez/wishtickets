-- Fix cleanup cron: ensure payments has created_at, make function robust.
-- If payments lacked created_at, the cron query would fail. Also re-schedule in case pg_cron wasn't ready.

-- 1. Add created_at to payments if missing (required for 3-minute stale filter)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 2. Replace function with robust version (handles null created_at, processes all stale pending/failed)
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

    -- Release seats (event_seats.id = tickets.seat_id for assigned seating)
    IF seat_ids IS NOT NULL AND array_length(seat_ids, 1) > 0 THEN
      UPDATE public.event_seats SET status = 'available' WHERE id = ANY(seat_ids);
    END IF;

    -- Update booking to failed (only if still pending)
    UPDATE public.bookings SET status = 'failed' WHERE id = r.booking_id AND status = 'pending';

    -- Update payment to failed
    UPDATE public.payments SET status = 'failed' WHERE id = r.payment_id;

    -- Delete payment and booking so they are removed from the database (and dashboard)
    DELETE FROM public.payments WHERE id = r.payment_id;
    DELETE FROM public.bookings WHERE id = r.booking_id;
  END LOOP;
END;
$$;

-- 3. Re-schedule cron (overwrites if exists; ensures job is active)
SELECT cron.schedule(
  'cleanup-pending-payments',
  '*/2 * * * *',
  'SELECT public.cleanup_stale_pending_payments()'
);
