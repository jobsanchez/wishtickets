-- Update get_admin_seat_assignments: use section_code/name in seat_label for admin_assignment_items

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
      SELECT jsonb_agg(item ORDER BY ord)
      FROM (
        SELECT 1 AS ord, jsonb_build_object(
          'seat_id', es.id,
          'section_id', NULL::uuid,
          'quantity', 1,
          'seat_label', es.row_label || es.seat_number
        ) AS item
        FROM public.event_seats es
        WHERE es.assignment_id = a.id
        UNION ALL
        SELECT 2 AS ord, jsonb_build_object(
          'seat_id', NULL::uuid,
          'section_id', ai.section_id,
          'quantity', ai.quantity,
          'seat_label', (COALESCE(sec.section_code, sec.name, 'Section') || ' x' || ai.quantity)
        ) AS item
        FROM public.admin_assignment_items ai
        LEFT JOIN public.event_sections sec ON sec.id = ai.section_id
        WHERE ai.assignment_id = a.id
      ) sub
    ) AS items
  FROM public.admin_seat_assignments a
  WHERE a.event_id = p_event_id
  ORDER BY a.created_at DESC;
$$;
