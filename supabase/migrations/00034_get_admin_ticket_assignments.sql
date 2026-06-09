-- RPC for admin ticket assignments list (tickets assigned to whom)

CREATE OR REPLACE FUNCTION public.get_admin_ticket_assignments(p_event_id uuid DEFAULT NULL)
RETURNS TABLE (
  ticket_id uuid,
  recipient_name text,
  event_id uuid,
  event_title text,
  section_name text,
  section_code text,
  seat_label text,
  booking_id uuid,
  assignment_status text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    t.id AS ticket_id,
    COALESCE(t.recipient_name, p.full_name, 'Guest') AS recipient_name,
    b.event_id,
    e.title AS event_title,
    COALESCE(es_sec.name, sec.name) AS section_name,
    es_sec.section_code,
    CASE
      WHEN t.seat_id IS NOT NULL AND es_seat.id IS NOT NULL
        THEN (es_seat.row_label || es_seat.seat_number)
      WHEN t.seat_id IS NOT NULL AND s_seat.id IS NOT NULL
        THEN (s_seat.row_label || s_seat.seat_number)
      WHEN t.section_id IS NOT NULL AND t.quantity > 0
        THEN 'Section x' || t.quantity
      ELSE '-'
    END AS seat_label,
    t.booking_id,
    COALESCE(a.status, 'confirmed') AS assignment_status,
    COALESCE(a.created_at, b.created_at) AS created_at
  FROM public.tickets t
  JOIN public.bookings b ON b.id = t.booking_id
  JOIN public.events e ON e.id = b.event_id
  LEFT JOIN public.event_sections es_sec ON es_sec.id = t.section_id
  LEFT JOIN public.sections sec ON sec.id = t.section_id AND sec.venue_id = e.venue_id
  LEFT JOIN public.event_seats es_seat ON es_seat.id = t.seat_id
  LEFT JOIN public.seats s_seat ON s_seat.id = t.seat_id AND s_seat.venue_id = e.venue_id
  LEFT JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE (p_event_id IS NULL OR b.event_id = p_event_id)
  ORDER BY COALESCE(a.created_at, b.created_at) DESC;
$$;

-- Also return assignments (reserved, not yet confirmed) for the admin UI
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
          'seat_id', ai.seat_id,
          'section_id', ai.section_id,
          'quantity', ai.quantity,
          'seat_label', CASE
            WHEN ai.seat_id IS NOT NULL AND es.id IS NOT NULL
              THEN (es.row_label || es.seat_number)
            WHEN ai.section_id IS NOT NULL
              THEN 'Section x' || ai.quantity
            ELSE NULL
          END
        )
      )
      FROM public.admin_assignment_items ai
      LEFT JOIN public.event_seats es ON es.id = ai.seat_id
      WHERE ai.assignment_id = a.id
    ) AS items
  FROM public.admin_seat_assignments a
  WHERE a.event_id = p_event_id
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_ticket_assignments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_seat_assignments(uuid) TO authenticated;
