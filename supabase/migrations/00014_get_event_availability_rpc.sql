-- RPC to fetch event availability (seats + sections) without RLS. Returns only aggregate data, no PII.
CREATE OR REPLACE FUNCTION public.get_event_availability(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_venue_id uuid;
  v_booking_ids uuid[];
  v_cart_ids uuid[];
  v_booked_seat_ids uuid[];
  v_reserved_seat_ids uuid[];
  v_taken_seat_ids uuid[];
  v_seats_json jsonb;
  v_sections_json jsonb;
BEGIN
  -- Event must exist and be published
  SELECT venue_id INTO v_venue_id
  FROM public.events
  WHERE id = p_event_id AND status = 'published'
  LIMIT 1;

  IF v_venue_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Confirmed booking IDs for this event
  SELECT array_agg(id) INTO v_booking_ids
  FROM public.bookings
  WHERE event_id = p_event_id AND status = 'confirmed';

  -- Active (non-expired) cart IDs for this event
  SELECT array_agg(id) INTO v_cart_ids
  FROM public.reservation_carts
  WHERE event_id = p_event_id AND expires_at > now();

  v_booking_ids := COALESCE(v_booking_ids, ARRAY[]::uuid[]);
  v_cart_ids := COALESCE(v_cart_ids, ARRAY[]::uuid[]);

  -- Booked seat IDs (from confirmed tickets)
  IF array_length(v_booking_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT seat_id) INTO v_booked_seat_ids
    FROM public.tickets
    WHERE booking_id = ANY(v_booking_ids) AND seat_id IS NOT NULL;
  END IF;
  v_booked_seat_ids := COALESCE(v_booked_seat_ids, ARRAY[]::uuid[]);

  -- Reserved seat IDs (from active carts)
  IF array_length(v_cart_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT seat_id) INTO v_reserved_seat_ids
    FROM public.reservation_items
    WHERE cart_id = ANY(v_cart_ids) AND seat_id IS NOT NULL;
  END IF;
  v_reserved_seat_ids := COALESCE(v_reserved_seat_ids, ARRAY[]::uuid[]);

  -- All taken seat IDs
  SELECT array_agg(DISTINCT s) INTO v_taken_seat_ids
  FROM unnest(v_booked_seat_ids || v_reserved_seat_ids) s;

  v_taken_seat_ids := COALESCE(v_taken_seat_ids, ARRAY[]::uuid[]);

  -- Build seats array with availability
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'row_label', s.row_label,
      'seat_number', s.seat_number,
      'section_id', s.section_id,
      'seat_type', s.seat_type,
      'available', NOT (s.id = ANY(v_taken_seat_ids))
    )
    ORDER BY s.row_label, s.seat_number
  ) INTO v_seats_json
  FROM public.seats s
  WHERE s.venue_id = v_venue_id;

  -- Build sections array with capacity and available
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
      'capacity', capacity,
      'available', GREATEST(0, capacity - booked_qty - reserved_qty)
    )
    ORDER BY name
  ) INTO v_sections_json
  FROM sec_data;

  RETURN jsonb_build_object(
    'seats', COALESCE(v_seats_json, '[]'::jsonb),
    'sections', COALESCE(v_sections_json, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_availability(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_event_availability(uuid) TO authenticated;
