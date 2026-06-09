-- Report rows: one per ticket for admin to release individually
CREATE OR REPLACE FUNCTION public.get_admin_report_tickets(p_limit int DEFAULT 100)
RETURNS TABLE (
  ticket_id uuid,
  booking_id uuid,
  event_title text,
  status text,
  section_label text,
  seat_label text,
  recipient_name text,
  total_cents int,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH allowed_bookings AS (
    SELECT b.id
    FROM public.bookings b
    WHERE (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
      OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics')
    )
    AND (b.status = 'confirmed' OR b.status = 'pending')
    ORDER BY b.created_at DESC
    LIMIT p_limit * 10
  )
  SELECT
    t.id AS ticket_id,
    t.booking_id,
    e.title AS event_title,
    b.status,
    COALESCE(es_sec.section_code, es_sec.name, sec.name, 'Other') AS section_label,
    CASE
      WHEN t.seat_id IS NOT NULL AND es_seat.id IS NOT NULL
        THEN (es_seat.row_label || es_seat.seat_number)
      WHEN t.seat_id IS NOT NULL AND s_seat.id IS NOT NULL
        THEN (s_seat.row_label || s_seat.seat_number)
      WHEN t.section_id IS NOT NULL AND t.quantity > 0
        THEN 'Section x' || t.quantity
      ELSE '-'
    END AS seat_label,
    COALESCE(t.recipient_name, p.full_name, 'Guest') AS recipient_name,
    b.total_cents,
    b.created_at
  FROM public.tickets t
  JOIN public.bookings b ON b.id = t.booking_id
  JOIN allowed_bookings ab ON ab.id = b.id
  LEFT JOIN public.events e ON e.id = b.event_id
  LEFT JOIN public.profiles p ON p.id = b.user_id
  LEFT JOIN public.event_seats es_seat ON es_seat.id = t.seat_id
  LEFT JOIN public.seats s_seat ON s_seat.id = t.seat_id AND s_seat.venue_id = e.venue_id
  LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es_seat.event_section_id)
  LEFT JOIN public.sections sec ON sec.id = s_seat.section_id
  ORDER BY b.created_at DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_tickets(int) TO authenticated;
