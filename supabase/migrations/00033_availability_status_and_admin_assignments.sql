-- Update get_event_availability:
-- 1. Return status per seat: available | reserved | sold
-- 2. Include admin_seat_assignments in reserved
-- 3. Include seating_type in sections

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
  v_admin_reserved_seat_ids uuid[];
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

  SELECT array_agg(DISTINCT ai.seat_id) INTO v_admin_reserved_seat_ids
  FROM public.admin_assignment_items ai
  JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
  WHERE a.event_id = p_event_id AND a.status = 'reserved' AND ai.seat_id IS NOT NULL;

  v_admin_reserved_seat_ids := COALESCE(v_admin_reserved_seat_ids, ARRAY[]::uuid[]);
  v_reserved_seat_ids := COALESCE(
    (SELECT array_agg(DISTINCT s) FROM unnest(v_reserved_seat_ids || v_admin_reserved_seat_ids) s),
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
          WHEN es.id = ANY(v_booked_seat_ids) THEN 'sold'
          WHEN es.id = ANY(v_reserved_seat_ids) THEN 'reserved'
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
        COALESCE(SUM(t.quantity), 0)::int AS booked_qty,
        COALESCE(
          (SELECT SUM(ri.quantity)::int
           FROM public.reservation_items ri
           WHERE ri.cart_id = ANY(v_cart_ids) AND ri.section_id = sec.id),
          0
        ) AS cart_reserved_qty,
        COALESCE(
          (SELECT COALESCE(SUM(ai.quantity), 0)::int
           FROM public.admin_assignment_items ai
           JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
           WHERE a.event_id = p_event_id AND a.status = 'reserved' AND ai.section_id = sec.id),
          0
        ) AS admin_reserved_qty
      FROM public.event_sections sec
      LEFT JOIN public.tickets t ON t.section_id = sec.id
        AND t.booking_id = ANY(v_booking_ids)
      WHERE sec.event_id = p_event_id
      GROUP BY sec.id, sec.name, sec.section_code, sec.capacity, sec.sort_order, sec.seating_type
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'section_code', section_code,
        'capacity', capacity,
        'seating_type', seating_type,
        'available', GREATEST(0, capacity - booked_qty - cart_reserved_qty - admin_reserved_qty)
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
