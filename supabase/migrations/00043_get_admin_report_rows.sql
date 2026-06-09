-- Report rows with section info for grouping (one row per booking, section)
CREATE OR REPLACE FUNCTION public.get_admin_report_rows(p_limit int DEFAULT 50)
RETURNS TABLE (
  booking_id uuid,
  status text,
  total_cents int,
  created_at timestamptz,
  event_title text,
  section_id uuid,
  section_label text
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
    LIMIT p_limit
  ),
  booking_sections AS (
    SELECT DISTINCT
      b.id AS booking_id,
      COALESCE(t.section_id, es.event_section_id, s_seat.section_id) AS section_id
    FROM allowed_bookings ab
    JOIN public.bookings b ON b.id = ab.id
    JOIN public.tickets t ON t.booking_id = b.id
    LEFT JOIN public.event_seats es ON es.id = t.seat_id
    LEFT JOIN public.seats s_seat ON s_seat.id = t.seat_id AND s_seat.venue_id = (SELECT venue_id FROM public.events WHERE id = b.event_id)
  ),
  section_labels AS (
    SELECT
      bs.booking_id,
      bs.section_id,
      COALESCE(es_sec.section_code, es_sec.name, sec.name, 'Other') AS section_label
    FROM booking_sections bs
    LEFT JOIN public.event_sections es_sec ON es_sec.id = bs.section_id
    LEFT JOIN public.sections sec ON sec.id = bs.section_id
  )
  SELECT
    b.id AS booking_id,
    b.status,
    b.total_cents,
    b.created_at,
    e.title AS event_title,
    sl.section_id,
    sl.section_label
  FROM allowed_bookings ab
  JOIN public.bookings b ON b.id = ab.id
  LEFT JOIN public.events e ON e.id = b.event_id
  JOIN section_labels sl ON sl.booking_id = b.id
  ORDER BY b.created_at DESC, sl.section_label;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_rows(int) TO authenticated;
