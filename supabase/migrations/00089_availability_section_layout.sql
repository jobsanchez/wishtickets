-- Include per-section background layout in get_event_availability (with event-level fallback)

CREATE OR REPLACE FUNCTION public.get_event_availability(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_venue_id uuid;
  v_event_seat_layout_image_url text;
  v_event_seat_layout_scale real;
  v_event_seat_layout_opacity real;
  v_use_event_seating boolean;
  v_booking_ids uuid[];
  v_cart_ids uuid[];
  v_booked_seat_ids uuid[];
  v_reserved_seat_ids uuid[];
  v_event_seats_reserved uuid[];
  v_seats_json jsonb;
  v_sections_json jsonb;
BEGIN
  SELECT venue_id, seat_layout_image_url, seat_layout_scale, seat_layout_opacity
  INTO v_venue_id, v_event_seat_layout_image_url, v_event_seat_layout_scale, v_event_seat_layout_opacity
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
        'grid_x', es.grid_x,
        'grid_y', es.grid_y,
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
        sec.color,
        COALESCE(sec.show_seat_selection, true) AS show_seat_selection,
        sec.seat_layout_image_url,
        sec.seat_layout_scale,
        sec.seat_layout_opacity,
        COALESCE(SUM(t.quantity), 0)::int AS booked_qty,
        COALESCE(
          (SELECT SUM(ri.quantity)::int
           FROM public.reservation_items ri
           WHERE ri.cart_id = ANY(v_cart_ids) AND ri.section_id = sec.id),
          0
        ) AS reserved_qty,
        COALESCE(
          (SELECT COALESCE(SUM(ai.quantity), 0)::int
           FROM public.admin_assignment_items ai
           JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
           WHERE a.event_id = p_event_id AND a.status = 'reserved' AND ai.section_id = sec.id),
          0
        ) AS admin_reserved_qty,
        (SELECT COUNT(*)::int FROM public.event_seats es2 WHERE es2.event_section_id = sec.id) AS seat_count,
        (SELECT COUNT(*)::int FROM public.event_seats es2
         WHERE es2.event_section_id = sec.id AND es2.status = 'available') AS available_from_seats
      FROM public.event_sections sec
      LEFT JOIN public.tickets t ON t.section_id = sec.id
        AND t.booking_id = ANY(v_booking_ids)
      WHERE sec.event_id = p_event_id
      GROUP BY sec.id, sec.name, sec.section_code, sec.capacity, sec.sort_order, sec.seating_type, sec.color, sec.show_seat_selection, sec.seat_layout_image_url, sec.seat_layout_scale, sec.seat_layout_opacity
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'section_code', section_code,
        'capacity', capacity,
        'seating_type', seating_type,
        'color', color,
        'show_seat_selection', show_seat_selection,
        'background_image_url', COALESCE(seat_layout_image_url, v_event_seat_layout_image_url),
        'background_scale', COALESCE(seat_layout_scale, v_event_seat_layout_scale, 1),
        'background_opacity', COALESCE(seat_layout_opacity, v_event_seat_layout_opacity, 0.5),
        'available', CASE
          WHEN seat_count > 0 THEN GREATEST(0, available_from_seats)
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
        'grid_x', NULL::int,
        'grid_y', NULL::int,
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
        'color', NULL::text,
        'show_seat_selection', true,
        'background_image_url', v_event_seat_layout_image_url,
        'background_scale', COALESCE(v_event_seat_layout_scale, 1),
        'background_opacity', COALESCE(v_event_seat_layout_opacity, 0.5),
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
