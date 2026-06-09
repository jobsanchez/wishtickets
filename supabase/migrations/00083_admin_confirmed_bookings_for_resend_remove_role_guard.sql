-- Redefine get_admin_confirmed_bookings_for_resend without role guard.
-- API layer (/api/admin/bookings/search) already enforces admin-only access.
CREATE OR REPLACE FUNCTION public.get_admin_confirmed_bookings_for_resend(
  p_email text,
  p_name text
)
RETURNS TABLE (
  booking_id uuid,
  event_title text,
  event_start_display text,
  buyer_name text,
  buyer_email text,
  total_tickets integer,
  tickets jsonb[]
) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      b.id AS booking_id,
      e.title AS event_title,
      to_char(e.event_start, 'Mon DD, YYYY HH12:MI AM') AS event_start_display,
      COALESCE(p.full_name, '') AS buyer_name,
      COALESCE(p.email, '')::text AS buyer_email
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    LEFT JOIN profiles p ON p.id = b.user_id
    WHERE b.status = 'confirmed'
      AND (
        (p_email IS NULL OR p_email = '')
        OR (p.email ILIKE '%' || p_email || '%')
      )
      AND (
        (p_name IS NULL OR p_name = '')
        OR (p.full_name ILIKE '%' || p_name || '%')
      )
  ),
  tickets_cte AS (
    SELECT
      t.booking_id,
      jsonb_build_object(
        'id', t.id,
        'section_name', COALESCE(esec.name, '—'),
        'seat_label',
          CASE
            WHEN esec.seating_type = 'standing' THEN 'Standing'
            WHEN esec.seating_type = 'free' THEN 'Free Seating'
            ELSE
              COALESCE('Row ' || es.row_label || ' Seat ' || es.seat_number, 'General')
          END
      ) AS ticket_obj
    FROM tickets t
    LEFT JOIN event_seats es ON es.id = t.seat_id
    LEFT JOIN event_sections esec ON esec.id = COALESCE(es.event_section_id, t.section_id)
  )
  SELECT
    b.booking_id,
    b.event_title,
    b.event_start_display,
    b.buyer_name,
    b.buyer_email,
    COUNT(t.ticket_obj) AS total_tickets,
    COALESCE(
      array_agg(
        t.ticket_obj
        ORDER BY t.ticket_obj->>'section_name', t.ticket_obj->>'seat_label'
      ),
      '{}'
    ) AS tickets
  FROM base b
  LEFT JOIN tickets_cte t ON t.booking_id = b.booking_id
  GROUP BY
    b.booking_id,
    b.event_title,
    b.event_start_display,
    b.buyer_name,
    b.buyer_email
  ORDER BY b.event_start_display DESC, b.event_title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_confirmed_bookings_for_resend(text, text) TO authenticated;

