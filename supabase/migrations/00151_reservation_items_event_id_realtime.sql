-- Denormalize event_id on reservation_items for Realtime filters + integrity.
-- Reject duplicate seat holds across active carts (race safety with API validation).

ALTER TABLE public.reservation_items
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;

UPDATE public.reservation_items ri
SET event_id = rc.event_id
FROM public.reservation_carts rc
WHERE rc.id = ri.cart_id
  AND ri.event_id IS NULL;

DELETE FROM public.reservation_items ri
WHERE NOT EXISTS (
  SELECT 1 FROM public.reservation_carts c WHERE c.id = ri.cart_id
);

UPDATE public.reservation_items ri
SET event_id = rc.event_id
FROM public.reservation_carts rc
WHERE rc.id = ri.cart_id
  AND (ri.event_id IS DISTINCT FROM rc.event_id);

ALTER TABLE public.reservation_items
  ALTER COLUMN event_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservation_items_event_id
  ON public.reservation_items (event_id);

COMMENT ON COLUMN public.reservation_items.event_id IS
  'Denormalized from reservation_carts.event_id for Realtime filters and queries.';

-- Keep event_id in sync with cart (authoritative: reservation_carts.event_id)
CREATE OR REPLACE FUNCTION public.sync_reservation_items_event_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event uuid;
BEGIN
  SELECT c.event_id INTO v_event
  FROM public.reservation_carts c
  WHERE c.id = NEW.cart_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'reservation_items: cart % not found', NEW.cart_id;
  END IF;

  NEW.event_id := v_event;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_items_event_id ON public.reservation_items;
CREATE TRIGGER trg_reservation_items_event_id
  BEFORE INSERT OR UPDATE OF cart_id ON public.reservation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reservation_items_event_id();

-- Prevent two active carts from holding the same seat (transactional race guard)
CREATE OR REPLACE FUNCTION public.reservation_items_reject_duplicate_active_seat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.seat_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reservation_items ri
    INNER JOIN public.reservation_carts rc ON rc.id = ri.cart_id
    WHERE ri.seat_id = NEW.seat_id
      AND ri.cart_id IS DISTINCT FROM NEW.cart_id
      AND rc.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'This seat was just taken by another shopper.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_items_unique_active_seat ON public.reservation_items;
CREATE TRIGGER trg_reservation_items_unique_active_seat
  BEFORE INSERT OR UPDATE OF seat_id, cart_id ON public.reservation_items
  FOR EACH ROW
  EXECUTE FUNCTION public.reservation_items_reject_duplicate_active_seat();

-- Supabase Realtime: expose row changes to clients (filter by event_id in app)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'reservation_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reservation_items;
    END IF;
  END IF;
END $$;
