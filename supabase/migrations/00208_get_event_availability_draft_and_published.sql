-- Allow seat availability for draft events when accessed via slug (same JSON shape as published).
-- Listing/upcoming RPCs remain published-only.

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
  v_canvases_json jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = p_event_id AND e.status IN ('draft', 'published')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT e.venue_id, e.seat_layout_image_url, e.seat_layout_scale, e.seat_layout_opacity
  INTO v_venue_id, v_event_seat_layout_image_url, v_event_seat_layout_scale, v_event_seat_layout_opacity
  FROM public.events e
  WHERE e.id = p_event_id AND e.status IN ('draft', 'published')
  LIMIT 1;

  SELECT EXISTS (SELECT 1 FROM public.event_sections WHERE event_id = p_event_id LIMIT 1)
  INTO v_use_event_seating;

  -- Legacy venue-based seating still requires a venue; event-level seating does not.
  IF v_venue_id IS NULL AND NOT v_use_event_seating THEN
    RETURN NULL;
  END IF;

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
  WHERE event_id = p_event_id AND status IN ('reserved', 'hold');

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
        'available', CASE
          WHEN es.assignment_id IS NOT NULL THEN false
          WHEN es.status IN ('sold', 'reserved', 'hold') THEN false
          WHEN es.id = ANY(v_booked_seat_ids || v_reserved_seat_ids) THEN false
          ELSE true
        END,
        'status', CASE
          WHEN es.status = 'hold' THEN 'hold'
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
        sec.column_direction,
        COALESCE(sec.show_seat_selection, true) AS show_seat_selection,
        sec.seat_layout_canvas_id,
        COALESCE(elc.image_url, sec.seat_layout_image_url) AS bg_image_url,
        COALESCE(elc.scale, sec.seat_layout_scale) AS bg_scale,
        COALESCE(elc.opacity, sec.seat_layout_opacity) AS bg_opacity,
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
         WHERE es2.event_section_id = sec.id
           AND NOT (es2.id = ANY(v_booked_seat_ids || v_reserved_seat_ids))) AS available_from_seats
      FROM public.event_sections sec
      LEFT JOIN public.event_layout_canvases elc ON elc.id = sec.seat_layout_canvas_id
      LEFT JOIN public.tickets t ON t.section_id = sec.id
        AND t.booking_id = ANY(v_booking_ids)
      WHERE sec.event_id = p_event_id
      GROUP BY sec.id, sec.name, sec.section_code, sec.capacity, sec.sort_order, sec.seating_type, sec.color, sec.column_direction, sec.show_seat_selection, sec.seat_layout_canvas_id, sec.seat_layout_image_url, sec.seat_layout_scale, sec.seat_layout_opacity, elc.image_url, elc.scale, elc.opacity
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'section_code', section_code,
        'capacity', capacity,
        'seating_type', seating_type,
        'color', color,
        'column_direction', column_direction,
        'show_seat_selection', show_seat_selection,
        'seat_layout_canvas_id', seat_layout_canvas_id,
        'background_image_url', COALESCE(bg_image_url, v_event_seat_layout_image_url),
        'background_scale', COALESCE(bg_scale, v_event_seat_layout_scale, 1),
        'background_opacity', COALESCE(bg_opacity, v_event_seat_layout_opacity, 0.5),
        'available', CASE
          WHEN seat_count > 0 THEN GREATEST(0, available_from_seats)
          ELSE GREATEST(0, capacity - booked_qty - reserved_qty - admin_reserved_qty)
        END
      )
      ORDER BY sort_order, name
    ) INTO v_sections_json
    FROM sec_data;

    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'image_url', c.image_url,
        'scale', COALESCE(c.scale, 1),
        'opacity', COALESCE(c.opacity, 0.5),
        'section_ids', COALESCE(
          (
            SELECT jsonb_agg(sec.id ORDER BY sec.sort_order, sec.name)
            FROM public.event_sections sec
            WHERE sec.event_id = p_event_id
              AND sec.seat_layout_canvas_id = c.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY c.sort_order, c.id
    ) INTO v_canvases_json
    FROM public.event_layout_canvases c
    WHERE c.event_id = p_event_id;
  ELSE
    v_canvases_json := '[]'::jsonb;
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
        'column_direction', NULL::text,
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
    'sections', COALESCE(v_sections_json, '[]'::jsonb),
    'canvases', COALESCE(v_canvases_json, '[]'::jsonb)
  );
END;
$$;
