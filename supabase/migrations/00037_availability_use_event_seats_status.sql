-- Update get_event_availability and get_admin_seat_assignments to use event_seats.status
-- instead of admin_assignment_items (dropped in 00036)

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
        COALESCE(SUM(t.quantity), 0)::int AS booked_qty,
        COALESCE(
          (SELECT SUM(ri.quantity)::int
           FROM public.reservation_items ri
           WHERE ri.cart_id = ANY(v_cart_ids) AND ri.section_id = sec.id),
          0
        ) AS reserved_qty
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
        'available', GREATEST(0, capacity - booked_qty - reserved_qty)
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

-- Update get_admin_seat_assignments: items from event_seats (assignment_id) instead of admin_assignment_items
CREATE OR REPLACE FUNCTION public.get_admin_seat_assignments(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  recipient_name text,
  status text,
  booking_id uuid,
  created_by uuid,
  created_at timestamptz,
  items jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.id,
    a.recipient_name,
    a.status,
    a.booking_id,
    a.created_by,
    a.created_at,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'seat_id', es.id,
          'section_id', NULL::uuid,
          'quantity', 1,
          'seat_label', es.row_label || es.seat_number
        )
      )
      FROM public.event_seats es
      WHERE es.assignment_id = a.id
    ) AS items
  FROM public.admin_seat_assignments a
  WHERE a.event_id = p_event_id
  ORDER BY a.created_at DESC;
$$;
