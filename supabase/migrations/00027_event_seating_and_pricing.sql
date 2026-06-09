-- Event-specific sections (when present, overrides venue sections for this event)
CREATE TABLE IF NOT EXISTS public.event_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 100,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_event_sections_event ON public.event_sections(event_id);

-- Event-specific seats (assigned seating within event_sections)
CREATE TABLE IF NOT EXISTS public.event_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  event_section_id uuid NOT NULL REFERENCES public.event_sections(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number text NOT NULL,
  seat_type text NOT NULL DEFAULT 'standard'
);

CREATE INDEX idx_event_seats_event ON public.event_seats(event_id);
CREATE INDEX idx_event_seats_section ON public.event_seats(event_section_id);

-- Event pricing: section_id can reference event_sections.id or sections.id (venue)
CREATE TABLE IF NOT EXISTS public.event_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section_id uuid NOT NULL,
  seat_type text DEFAULT '',
  price_cents int NOT NULL DEFAULT 50000,
  UNIQUE(event_id, section_id, seat_type)
);

CREATE INDEX idx_event_prices_event ON public.event_prices(event_id);

-- RLS
ALTER TABLE public.event_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage event_sections" ON public.event_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_seats'))
  );

CREATE POLICY "Admin can manage event_seats" ON public.event_seats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_seats'))
  );

CREATE POLICY "Admin can manage event_prices" ON public.event_prices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

-- Public read for availability (get_event_availability RPC is SECURITY DEFINER, but allow direct read if needed)
CREATE POLICY "Public can read event_sections" ON public.event_sections FOR SELECT USING (true);
CREATE POLICY "Public can read event_seats" ON public.event_seats FOR SELECT USING (true);
CREATE POLICY "Public can read event_prices" ON public.event_prices FOR SELECT USING (true);

-- Update get_event_availability: use event_sections/event_seats when present, else venue
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
  v_taken_seat_ids uuid[];
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

  SELECT array_agg(DISTINCT s) INTO v_taken_seat_ids
  FROM unnest(v_booked_seat_ids || v_reserved_seat_ids) s;
  v_taken_seat_ids := COALESCE(v_taken_seat_ids, ARRAY[]::uuid[]);

  IF v_use_event_seating THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', es.id,
        'row_label', es.row_label,
        'seat_number', es.seat_number,
        'section_id', es.event_section_id,
        'seat_type', es.seat_type,
        'available', NOT (es.id = ANY(v_taken_seat_ids))
      )
      ORDER BY es.row_label, es.seat_number
    ) INTO v_seats_json
    FROM public.event_seats es
    WHERE es.event_id = p_event_id;

    WITH sec_data AS (
      SELECT sec.id, sec.name, sec.capacity, sec.sort_order,
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
      GROUP BY sec.id, sec.name, sec.capacity, sec.sort_order
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'capacity', capacity,
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
        'seat_type', s.seat_type,
        'available', NOT (s.id = ANY(v_taken_seat_ids))
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
        'capacity', capacity,
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
