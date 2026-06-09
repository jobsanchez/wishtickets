-- Drill-down detail for KPI card modals.
-- Auth: view_sales_analytics or admin/super_admin (same as get_admin_dashboard_metrics).

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_drilldown(
  p_event_id uuid,
  p_metric text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_booking_ids uuid[];
  v_rows jsonb;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics')
  ) THEN
    RETURN jsonb_build_object('error', 'Forbidden');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_booking_ids
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  CASE p_metric
    WHEN 'capacity' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', sec_name,
        'capacity', cap
      ) ORDER BY sort_order, sec_name)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(sec.section_code, sec.name) AS sec_name,
          sec.sort_order,
          (CASE WHEN COALESCE(es_cnt.cnt, 0) > 0 THEN es_cnt.cnt ELSE sec.capacity END) AS cap
        FROM public.event_sections sec
        LEFT JOIN (
          SELECT event_section_id, COUNT(*)::int AS cnt
          FROM public.event_seats WHERE event_id = p_event_id
          GROUP BY event_section_id
        ) es_cnt ON es_cnt.event_section_id = sec.id
        WHERE sec.event_id = p_event_id
      ) x;

    WHEN 'sold' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'sold_count', sold_count,
        'capacity', capacity,
        'sold_pct', sold_pct
      ) ORDER BY sold_pct DESC NULLS LAST)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(sec.section_code, sec.name) AS section_name,
          COALESCE(sold.cnt, 0) AS sold_count,
          (CASE WHEN COALESCE(es_cnt.cnt, 0) > 0 THEN es_cnt.cnt ELSE sec.capacity END) AS capacity,
          CASE WHEN GREATEST(COALESCE(es_cnt.cnt, 0), sec.capacity) > 0
            THEN ROUND((COALESCE(sold.cnt, 0)::numeric / GREATEST(COALESCE(es_cnt.cnt, 0), sec.capacity)) * 100, 1)
            ELSE 0 END AS sold_pct
        FROM public.event_sections sec
        LEFT JOIN (
          SELECT event_section_id, COUNT(*)::int AS cnt
          FROM public.event_seats WHERE event_id = p_event_id
          GROUP BY event_section_id
        ) es_cnt ON es_cnt.event_section_id = sec.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt
          FROM public.tickets t
          JOIN public.bookings b ON b.id = t.booking_id
          LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
          WHERE t.booking_id = ANY(v_booking_ids)
            AND a.id IS NULL AND COALESCE(t.is_complementary, false) = false
            AND (t.section_id = sec.id OR t.seat_id IN (SELECT id FROM public.event_seats WHERE event_section_id = sec.id))
        ) sold ON true
        WHERE sec.event_id = p_event_id
      ) x;

    WHEN 'occupancy' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'capacity', cap,
        'sold', sold,
        'distributed', distributed,
        'complimentary', complimentary,
        'available', GREATEST(0, cap - sold - distributed - complimentary),
        'occupancy_pct', CASE WHEN cap > 0 THEN ROUND(((sold + distributed + complimentary)::numeric / cap) * 100, 1) ELSE 0 END
      ) ORDER BY sort_order, sec_name)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(sec.section_code, sec.name) AS section_name,
          sec.sort_order,
          sec.name AS sec_name,
          (CASE WHEN COALESCE(es_cnt2.cnt, 0) > 0 THEN es_cnt2.cnt ELSE sec.capacity END) AS cap,
          COALESCE(vss.sold, 0)::int AS sold,
          COALESCE(vss.distributed, 0)::int AS distributed,
          COALESCE(vss.complimentary, 0)::int AS complimentary
        FROM public.event_sections sec
        LEFT JOIN (
          SELECT event_section_id, COUNT(*)::int AS cnt
          FROM public.event_seats WHERE event_id = p_event_id
          GROUP BY event_section_id
        ) es_cnt2 ON es_cnt2.event_section_id = sec.id
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(CASE WHEN tc.cat = 'sold' THEN COALESCE(t.quantity, 1) ELSE 0 END), 0) AS sold,
            COALESCE(SUM(CASE WHEN tc.cat = 'distributed' THEN COALESCE(t.quantity, 1) ELSE 0 END), 0) AS distributed,
            COALESCE(SUM(CASE WHEN tc.cat = 'complimentary' THEN COALESCE(t.quantity, 1) ELSE 0 END), 0) AS complimentary
          FROM public.tickets t
          JOIN public.bookings b ON b.id = t.booking_id
          LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN a.id IS NOT NULL AND a.distribution_category = 'complementary' THEN 'complimentary'
              WHEN t.is_complementary THEN 'complimentary'
              WHEN a.id IS NOT NULL AND a.distribution_category = 'sales' THEN 'distributed'
              ELSE 'sold'
            END AS cat
          ) tc
          WHERE t.booking_id = ANY(v_booking_ids)
            AND (t.section_id = sec.id OR t.seat_id IN (SELECT id FROM public.event_seats WHERE event_section_id = sec.id))
        ) vss ON true
        WHERE sec.event_id = p_event_id
      ) x;

    WHEN 'revenue' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'booking_id', b.id,
        'total_cents', b.total_cents,
        'created_at', b.created_at,
        'payment_method', CASE WHEN b.accepted_by_admin_id IS NULL THEN 'paymongo' ELSE 'onsite' END,
        'buyer_name', COALESCE(p.full_name, a.recipient_name, 'Guest'),
        'buyer_email', COALESCE(NULLIF(TRIM(a.recipient_email), ''), '')
      ) ORDER BY b.created_at DESC)
      INTO v_rows
      FROM public.bookings b
      LEFT JOIN public.profiles p ON p.id = b.user_id
      LEFT JOIN LATERAL (SELECT recipient_name, recipient_email FROM public.admin_seat_assignments WHERE booking_id = b.id LIMIT 1) a ON true
      WHERE b.event_id = p_event_id AND b.status = 'confirmed'
        AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
        AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

    WHEN 'distributed' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'recipient_name', recipient_name,
        'recipient_email', recipient_email,
        'quantity', qty
      ) ORDER BY section_name, recipient_name)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(es_sec.section_code, es_sec.name, sec.name, 'Other') AS section_name,
          COALESCE(a.recipient_name, '—') AS recipient_name,
          COALESCE(NULLIF(TRIM(a.recipient_email), ''), '—') AS recipient_email,
          COALESCE(t.quantity, 1)::int AS qty
        FROM public.tickets t
        JOIN public.bookings b ON b.id = t.booking_id
        JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        LEFT JOIN public.event_seats es ON es.id = t.seat_id
        LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es.event_section_id)
        LEFT JOIN public.sections sec ON sec.id = t.section_id
        WHERE t.booking_id = ANY(v_booking_ids)
          AND a.distribution_category = 'sales'
      ) x;

    WHEN 'complimentary' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'recipient_name', recipient_name,
        'recipient_email', recipient_email,
        'quantity', qty
      ) ORDER BY section_name, recipient_name)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(es_sec.section_code, es_sec.name, sec.name, 'Other') AS section_name,
          COALESCE(a.recipient_name, t.recipient_name, '—') AS recipient_name,
          COALESCE(NULLIF(TRIM(a.recipient_email), ''), '—') AS recipient_email,
          COALESCE(t.quantity, 1)::int AS qty
        FROM public.tickets t
        JOIN public.bookings b ON b.id = t.booking_id
        LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        LEFT JOIN public.event_seats es ON es.id = t.seat_id
        LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es.event_section_id)
        LEFT JOIN public.sections sec ON sec.id = t.section_id
        WHERE t.booking_id = ANY(v_booking_ids)
          AND (t.is_complementary = true OR (a.id IS NOT NULL AND a.distribution_category = 'complementary'))
      ) x;

    WHEN 'admitted' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'recipient_name', recipient_name,
        'checkin_time', checkin_time,
        'ticket_category', ticket_category
      ) ORDER BY checkin_time DESC)
      INTO v_rows
      FROM (
        SELECT
          COALESCE(es_sec.section_code, es_sec.name, sec.name, 'Other') AS section_name,
          COALESCE(t.recipient_name, a.recipient_name, p.full_name, '—') AS recipient_name,
          ar.created_at AS checkin_time,
          CASE
            WHEN a.id IS NOT NULL AND a.distribution_category = 'complementary' THEN 'complimentary'
            WHEN t.is_complementary THEN 'complimentary'
            WHEN a.id IS NOT NULL AND a.distribution_category = 'sales' THEN 'distributed'
            ELSE 'sold'
          END AS ticket_category
        FROM public.admission_records ar
        JOIN public.tickets t ON t.id = ar.ticket_id
        JOIN public.bookings b ON b.id = t.booking_id
        LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        LEFT JOIN public.profiles p ON p.id = b.user_id
        LEFT JOIN public.event_seats es ON es.id = t.seat_id
        LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es.event_section_id)
        LEFT JOIN public.sections sec ON sec.id = t.section_id
        WHERE ar.event_id = p_event_id
          AND ar.action IN ('admit', 're_entry_granted')
      ) x;

    ELSE
      RETURN jsonb_build_object('error', 'Invalid metric');
  END CASE;

  RETURN jsonb_build_object('rows', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_drilldown(uuid, text, date, date) TO authenticated;
