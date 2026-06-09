-- Add event_code and scan_code for 8-char QR/scan codes
-- 1. events.event_code (4 alphanumeric, unique)
-- 2. event_seats.scan_code (4 alphanumeric, unique per event)
-- 3. Backfill existing data
-- 4. Trigger for new events

-- Helper to generate 4 alphanumeric chars (0-9, A-Z)
CREATE OR REPLACE FUNCTION public.generate_alphanumeric_4()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i int;
  r real;
BEGIN
  FOR i IN 1..4 LOOP
    r := random();
    result := result || substr(chars, 1 + floor(r * 36)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 1. Add event_code to events (nullable first for backfill)
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS event_code text;

-- 2. Add scan_code to event_seats (nullable first for backfill)
ALTER TABLE public.event_seats
ADD COLUMN IF NOT EXISTS scan_code text;

-- 3. Backfill event_code for existing events
DO $$
DECLARE
  r record;
  code text;
  done boolean;
BEGIN
  FOR r IN SELECT id FROM public.events WHERE event_code IS NULL
  LOOP
    done := false;
    WHILE NOT done LOOP
      code := public.generate_alphanumeric_4();
      IF NOT EXISTS (SELECT 1 FROM public.events WHERE event_code = code) THEN
        UPDATE public.events SET event_code = code WHERE id = r.id;
        done := true;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Backfill scan_code for existing event_seats
DO $$
DECLARE
  r record;
  code text;
  done boolean;
BEGIN
  FOR r IN
    SELECT es.id, es.event_id
    FROM public.event_seats es
    WHERE es.scan_code IS NULL
  LOOP
    done := false;
    WHILE NOT done LOOP
      code := public.generate_alphanumeric_4();
      IF NOT EXISTS (
        SELECT 1 FROM public.event_seats
        WHERE event_id = r.event_id AND scan_code = code
      ) THEN
        UPDATE public.event_seats SET scan_code = code WHERE id = r.id;
        done := true;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 5. Ensure events without event_code get one (e.g. events created during migration)
DO $$
DECLARE
  r record;
  code text;
  done boolean;
BEGIN
  FOR r IN SELECT id FROM public.events WHERE event_code IS NULL
  LOOP
    done := false;
    WHILE NOT done LOOP
      code := public.generate_alphanumeric_4();
      IF NOT EXISTS (SELECT 1 FROM public.events WHERE event_code = code) THEN
        UPDATE public.events SET event_code = code WHERE id = r.id;
        done := true;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- 6. Add constraints
ALTER TABLE public.events
ALTER COLUMN event_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_code ON public.events(event_code);

ALTER TABLE public.event_seats
ALTER COLUMN scan_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_seats_event_scan
ON public.event_seats(event_id, scan_code);

-- 7. Trigger: set event_code on new events (BEFORE INSERT)
CREATE OR REPLACE FUNCTION public.set_event_code_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  done boolean := false;
BEGIN
  IF NEW.event_code IS NULL OR NEW.event_code = '' THEN
    WHILE NOT done LOOP
      code := public.generate_alphanumeric_4();
      IF NOT EXISTS (SELECT 1 FROM public.events WHERE event_code = code) THEN
        NEW.event_code := code;
        done := true;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_event_code ON public.events;
CREATE TRIGGER trigger_set_event_code
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_code_on_insert();

-- 8. Update get_event_availability: for sections with event_seats, derive available from seat counts
-- Free/standing sections without event_seats get available=0
CREATE OR REPLACE FUNCTION public.get_event_availability(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_venue_id uuid;
  v_use_event_seating boolean;
  v_booking_ids uuid[];
  v_cart_ids uuid[];
  v_booked_seat_ids uuid[];
  v_reserved_seat_ids uuid[];
  v_event_seats_reserved uuid[];
  v_seats_json jsonb;
  v_sections_json jsonb;
BEGIN
  SELECT venue_id INTO v_venue_id
  FROM public.events
  WHERE id = p_event_id AND status = 'published'
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.event_sections WHERE event_id = p_event_id LIMIT 1) INTO v_use_event_seating;

  SELECT array_agg(id) INTO v_booking_ids
  FROM public.bookings
  WHERE event_id = p_event_id AND status = 'confirmed';

  SELECT array_agg(id) INTO v_cart_ids
  FROM public.reservation_carts
  WHERE event_id = p_event_id AND expires_at > now();

  v_booking_ids := COALESCE(v_booking_ids, ARRAY[]::uuid[]);
  v_cart_ids := COALESCE(v_cart_ids, ARRAY[]::uuid[]);

  IF array_length(v_booking_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT seat_id) INTO v_booked_seat_ids
    FROM public.tickets
    WHERE booking_id = ANY(v_booking_ids) AND seat_id IS NOT NULL;
  END IF;
  v_booked_seat_ids := COALESCE(v_booked_seat_ids, ARRAY[]::uuid[]);

  IF array_length(v_cart_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT seat_id) INTO v_reserved_seat_ids
    FROM public.reservation_items
    WHERE cart_id = ANY(v_cart_ids) AND seat_id IS NOT NULL;
  END IF;
  v_reserved_seat_ids := COALESCE(v_reserved_seat_ids, ARRAY[]::uuid[]);

  SELECT array_agg(id) INTO v_event_seats_reserved
  FROM public.event_seats
  WHERE event_id = p_event_id AND status = 'reserved';

  v_event_seats_reserved := COALESCE(v_event_seats_reserved, ARRAY[]::uuid[]);
  v_reserved_seat_ids := COALESCE(
    (SELECT array_agg(DISTINCT s) FROM unnest(v_reserved_seat_ids || v_event_seats_reserved) s),
    ARRAY[]::uuid[]
  );

  IF v_use_event_seating THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', es.id,
        'row_label', es.row_label,
        'seat_number', es.seat_number,
        'section_id', es.event_section_id,
        'available', NOT (es.id = ANY(v_booked_seat_ids || v_reserved_seat_ids)),
        'status', CASE
          WHEN es.assignment_id IS NOT NULL THEN 'reserved'
          WHEN es.id = ANY(v_booked_seat_ids) THEN 'sold'
          WHEN es.status = 'sold' THEN 'sold'
          WHEN es.status = 'reserved' OR es.id = ANY(v_reserved_seat_ids) THEN 'reserved'
          ELSE 'available'
        END
      )
      ORDER BY es.row_label, es.seat_number
    ) INTO v_seats_json
    FROM public.event_seats es
    WHERE es.event_id = p_event_id;

    WITH sec_data AS (
      SELECT sec.id, sec.name, sec.section_code, sec.capacity, sec.sort_order,
        COALESCE(sec.seating_type, 'assigned') AS seating_type,
        COALESCE(
          (SELECT COALESCE(SUM(ai.quantity), 0)::int
           FROM public.admin_assignment_items ai
           JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
           WHERE a.event_id = p_event_id AND a.status = 'reserved' AND ai.section_id = sec.id),
          0
        ) AS admin_reserved_qty,
        (SELECT COUNT(*)::int FROM public.event_seats es2
         WHERE es2.event_section_id = sec.id) AS seat_count,
        (SELECT COUNT(*)::int FROM public.event_seats es2
         WHERE es2.event_section_id = sec.id
           AND (es2.id = ANY(v_booked_seat_ids || v_reserved_seat_ids) OR es2.assignment_id IS NOT NULL)) AS taken_count,
        COALESCE(
          (SELECT SUM(t.quantity)::int FROM public.tickets t
           LEFT JOIN public.event_seats es2 ON es2.id = t.seat_id AND es2.event_id = p_event_id
           WHERE t.booking_id = ANY(v_booking_ids)
             AND (t.section_id = sec.id OR es2.event_section_id = sec.id)),
          0
        ) AS booked_qty,
        COALESCE(
          (SELECT SUM(ri.quantity)::int
           FROM public.reservation_items ri
           WHERE ri.cart_id = ANY(v_cart_ids) AND ri.section_id = sec.id),
          0
        ) AS reserved_qty
      FROM public.event_sections sec
      WHERE sec.event_id = p_event_id
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'section_code', section_code,
        'capacity', capacity,
        'seating_type', seating_type,
        'available', CASE
          WHEN seat_count > 0 THEN GREATEST(0, seat_count - taken_count - admin_reserved_qty)
          ELSE GREATEST(0, capacity - booked_qty - reserved_qty - admin_reserved_qty)
        END
      )
      ORDER BY sort_order, name
    ) INTO v_sections_json
    FROM sec_data;
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'row_label', s.row_label,
        'seat_number', s.seat_number,
        'section_id', s.section_id,
        'available', NOT (s.id = ANY(v_booked_seat_ids || v_reserved_seat_ids)),
        'status', CASE
          WHEN s.id = ANY(v_booked_seat_ids) THEN 'sold'
          WHEN s.id = ANY(v_reserved_seat_ids) THEN 'reserved'
          ELSE 'available'
        END
      )
      ORDER BY s.row_label, s.seat_number
    ) INTO v_seats_json
    FROM public.seats s
    WHERE s.venue_id = v_venue_id;

    WITH sec_data AS (
      SELECT sec.id, sec.name, sec.capacity,
        COALESCE(SUM(t.quantity), 0)::int AS booked_qty,
        COALESCE(
          (SELECT SUM(ri.quantity)::int
           FROM public.reservation_items ri
           WHERE ri.cart_id = ANY(v_cart_ids) AND ri.section_id = sec.id),
          0
        ) AS reserved_qty
      FROM public.sections sec
      LEFT JOIN public.tickets t ON t.section_id = sec.id
        AND t.booking_id = ANY(v_booking_ids)
      WHERE sec.venue_id = v_venue_id
      GROUP BY sec.id, sec.name, sec.capacity
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'section_code', NULL::text,
        'capacity', capacity,
        'seating_type', 'assigned',
        'available', GREATEST(0, capacity - booked_qty - reserved_qty)
      )
      ORDER BY name
    ) INTO v_sections_json
    FROM sec_data;
  END IF;

  RETURN jsonb_build_object(
    'seats', COALESCE(v_seats_json, '[]'::jsonb),
    'sections', COALESCE(v_sections_json, '[]'::jsonb)
  );
END;
$$;
