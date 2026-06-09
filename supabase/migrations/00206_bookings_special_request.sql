-- Special request (accessibility / seating notes) at checkout, stored on the booking.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS special_request_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS special_request_details text;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_special_request_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_special_request_type_check CHECK (
    special_request_type = ANY (ARRAY[
      'none',
      'pwd',
      'senior_citizen',
      'pregnant',
      'others'
    ]::text[])
  );

COMMENT ON COLUMN public.bookings.special_request_type IS 'Buyer special request category at checkout; none = no request.';
COMMENT ON COLUMN public.bookings.special_request_details IS 'Optional free-text details (required when type is others).';

-- Return type (OUT params) changed; REPLACE cannot alter it — drop then recreate.
DROP FUNCTION IF EXISTS public.get_admin_confirmed_bookings_for_resend(text, text);

-- Resend search: include special request + booking time for staff.
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
  tickets jsonb[],
  booking_created_display text,
  special_request_type text,
  special_request_details text
) AS $$
BEGIN
  RETURN QUERY
  WITH buyers AS (
    SELECT
      id,
      full_name,
      email
    FROM profiles
    WHERE 1 = 1
      AND (
        (p_email IS NULL OR p_email = '')
        OR (email ILIKE '%' || p_email || '%')
      )
      AND (
        (p_name IS NULL OR p_name = '')
        OR (full_name ILIKE '%' || p_name || '%')
      )
  ),
  base AS (
    SELECT
      b.id AS booking_id,
      e.title AS event_title,
      to_char(e.event_start, 'Mon DD, YYYY HH12:MI AM') AS event_start_display,
      COALESCE(buyers.full_name, '') AS buyer_name,
      COALESCE(buyers.email, '')::text AS buyer_email,
      b.created_at AS booking_created_at,
      b.special_request_type,
      b.special_request_details
    FROM bookings b
    JOIN events e ON e.id = b.event_id
    JOIN buyers ON buyers.id = b.user_id
    WHERE b.status = 'confirmed'
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
    COUNT(t.ticket_obj)::integer AS total_tickets,
    COALESCE(
      array_agg(
        t.ticket_obj
        ORDER BY t.ticket_obj->>'section_name', t.ticket_obj->>'seat_label'
      ),
      '{}'
    ) AS tickets,
    to_char(b.booking_created_at, 'Mon DD, YYYY HH12:MI AM') AS booking_created_display,
    b.special_request_type,
    b.special_request_details
  FROM base b
  LEFT JOIN tickets_cte t ON t.booking_id = b.booking_id
  GROUP BY
    b.booking_id,
    b.event_title,
    b.event_start_display,
    b.buyer_name,
    b.buyer_email,
    b.booking_created_at,
    b.special_request_type,
    b.special_request_details
  ORDER BY b.event_start_display DESC, b.event_title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_admin_confirmed_bookings_for_resend(text, text) TO authenticated;
