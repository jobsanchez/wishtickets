-- Cleanup stale pending/failed payments: release seats, delete tickets, mark booking/payment failed.
-- Runs every 2 minutes via pg_cron. Payments older than 3 minutes with status pending/failed are processed.

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
      AND p.created_at < now() - interval '3 minutes'
  LOOP
    -- Get seat_ids from tickets
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
  END LOOP;
END;
$$;

-- Schedule with pg_cron (every 2 minutes)
-- Prerequisite: Enable pg_cron in Supabase Dashboard → Database → Extensions (or Integrations → Cron)
SELECT cron.schedule(
  'cleanup-pending-payments',
  '*/2 * * * *',
  'SELECT public.cleanup_stale_pending_payments()'
);
