-- Add distribution_category to admin_seat_assignments (Sales vs Complementary)
ALTER TABLE public.admin_seat_assignments
ADD COLUMN IF NOT EXISTS distribution_category text NOT NULL DEFAULT 'sales'
CHECK (distribution_category IN ('sales', 'complementary'));

COMMENT ON COLUMN public.admin_seat_assignments.distribution_category IS 'Whether seats are sold or given as complementary';

-- Add is_complementary to tickets for on-demand image generation
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS is_complementary boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tickets.is_complementary IS 'True when ticket was assigned as complementary (manual distribution)';

-- Update get_admin_seat_assignments to return distribution_category
DROP FUNCTION IF EXISTS public.get_admin_seat_assignments(uuid);

CREATE OR REPLACE FUNCTION public.get_admin_seat_assignments(p_event_id uuid)
RETURNS TABLE (
  id uuid,
  recipient_name text,
  recipient_email text,
  status text,
  booking_id uuid,
  created_by uuid,
  created_at timestamptz,
  email_sent_count int,
  distribution_category text,
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
    a.recipient_email,
    a.status,
    a.booking_id,
    a.created_by,
    a.created_at,
    COALESCE(a.email_sent_count, 0),
    COALESCE(a.distribution_category, 'sales'),
    COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY ord)
        FROM (
          SELECT 1 AS ord, jsonb_build_object(
            'seat_id', es.id,
            'section_id', es.event_section_id,
            'quantity', 1,
            'seat_label', (CASE WHEN sec.id IS NOT NULL THEN COALESCE(sec.section_code, sec.name) || ' ' ELSE '' END || es.row_label || es.seat_number)
          ) AS item
          FROM public.event_seats es
          LEFT JOIN public.event_sections sec ON sec.id = es.event_section_id
          WHERE es.assignment_id = a.id
          UNION ALL
          SELECT 2 AS ord, jsonb_build_object(
            'seat_id', ai.seat_id,
            'section_id', es2.event_section_id,
            'quantity', 1,
            'seat_label', (CASE WHEN sec2.id IS NOT NULL THEN COALESCE(sec2.section_code, sec2.name) || ' ' ELSE '' END || es2.row_label || es2.seat_number)
          ) AS item
          FROM public.admin_assignment_items ai
          JOIN public.event_seats es2 ON es2.id = ai.seat_id
          LEFT JOIN public.event_sections sec2 ON sec2.id = es2.event_section_id
          WHERE ai.assignment_id = a.id AND ai.seat_id IS NOT NULL
          UNION ALL
          SELECT 3 AS ord, jsonb_build_object(
            'seat_id', NULL::uuid,
            'section_id', ai.section_id,
            'quantity', ai.quantity,
            'seat_label', (COALESCE(sec3.section_code, sec3.name, 'Section') || ' x' || ai.quantity)
          ) AS item
          FROM public.admin_assignment_items ai
          LEFT JOIN public.event_sections sec3 ON sec3.id = ai.section_id
          WHERE ai.assignment_id = a.id AND ai.section_id IS NOT NULL
        ) sub
      ),
      (
        SELECT jsonb_agg(item ORDER BY ord)
        FROM (
          SELECT 1 AS ord, jsonb_build_object(
            'seat_id', t.seat_id,
            'section_id', COALESCE(t.section_id, es3.event_section_id),
            'quantity', COALESCE(t.quantity, 1),
            'seat_label', CASE
              WHEN t.seat_id IS NOT NULL AND es3.id IS NOT NULL
                THEN (CASE WHEN sec4.id IS NOT NULL THEN COALESCE(sec4.section_code, sec4.name) || ' ' ELSE '' END || es3.row_label || es3.seat_number)
              WHEN t.section_id IS NOT NULL
                THEN (COALESCE(sec5.section_code, sec5.name, sec_venue2.name, 'Section') || ' x' || COALESCE(t.quantity, 1))
              ELSE NULL
            END
          ) AS item
          FROM public.tickets t
          LEFT JOIN public.event_seats es3 ON es3.id = t.seat_id
          LEFT JOIN public.event_sections sec4 ON sec4.id = es3.event_section_id
          LEFT JOIN public.event_sections sec5 ON sec5.id = t.section_id
          LEFT JOIN public.sections sec_venue2 ON sec_venue2.id = t.section_id
          WHERE a.booking_id IS NOT NULL AND t.booking_id = a.booking_id
        ) sub
      ),
      '[]'::jsonb
    ) AS items
  FROM public.admin_seat_assignments a
  WHERE a.event_id = p_event_id
  AND public.is_authorized_for_event(p_event_id)
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_seat_assignments(uuid) TO authenticated;
