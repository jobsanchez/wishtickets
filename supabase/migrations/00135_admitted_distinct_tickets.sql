-- Admitted: count distinct tickets (seats), exclude re-entry scans.
-- One row per ticket, first admission only. Re-entry return scans are not counted.

-- Update get_admin_dashboard_metrics
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(
  p_event_id uuid,
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
  v_event record;
  v_is_event_day boolean := false;
  v_booking_ids uuid[];
  v_total_capacity int := 0;
  v_gross_revenue bigint := 0;
  v_total_sold int := 0;
  v_distributed int := 0;
  v_complimentary int := 0;
  v_admitted int := 0;
  v_occupied int := 0;
  v_paymongo_revenue bigint := 0;
  v_onsite_revenue bigint := 0;
  v_sold_admitted int := 0;
  v_distributed_admitted int := 0;
  v_complimentary_admitted int := 0;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics')
  ) THEN
    RETURN jsonb_build_object('error', 'Forbidden');
  END IF;

  SELECT id, title, event_start INTO v_event
  FROM public.events WHERE id = p_event_id LIMIT 1;
  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  v_is_event_day := (v_event.event_start::date = CURRENT_DATE);

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_booking_ids
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  SELECT COALESCE(SUM(b.total_cents), 0) INTO v_gross_revenue
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  SELECT
    COALESCE(SUM(CASE WHEN b.accepted_by_admin_id IS NULL THEN b.total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.accepted_by_admin_id IS NOT NULL THEN b.total_cents ELSE 0 END), 0)
  INTO v_paymongo_revenue, v_onsite_revenue
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  IF array_length(v_booking_ids, 1) > 0 THEN
    WITH ticket_cat AS (
      SELECT
        CASE
          WHEN a.id IS NOT NULL AND a.distribution_category = 'complementary' THEN 'complimentary'
          WHEN t.is_complementary THEN 'complimentary'
          WHEN a.id IS NOT NULL AND a.distribution_category = 'sales' THEN 'distributed'
          ELSE 'sold'
        END AS cat
      FROM public.tickets t
      JOIN public.bookings b ON b.id = t.booking_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
      WHERE t.booking_id = ANY(v_booking_ids)
    )
    SELECT
      COUNT(*) FILTER (WHERE cat = 'sold'),
      COUNT(*) FILTER (WHERE cat = 'distributed'),
      COUNT(*) FILTER (WHERE cat = 'complimentary')
    INTO v_total_sold, v_distributed, v_complimentary
    FROM ticket_cat;

    v_occupied := v_total_sold + v_distributed + v_complimentary;
  END IF;

  -- Admitted: distinct tickets only, first admission (action='admit'). No re-entry return scans.
  SELECT COUNT(*)::int INTO v_admitted
  FROM (
    SELECT DISTINCT ar.ticket_id
    FROM public.admission_records ar
    WHERE ar.event_id = p_event_id
      AND ar.action = 'admit'
  ) x;

  IF v_is_event_day THEN
    -- sold/distributed/complimentary admitted: distinct tickets per category
    SELECT COUNT(*)::int INTO v_sold_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action = 'admit'
        AND a.id IS NULL AND COALESCE(t.is_complementary, false) = false
    ) x;

    SELECT COUNT(*)::int INTO v_distributed_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action = 'admit'
        AND a.distribution_category = 'sales'
    ) x;

    SELECT COUNT(*)::int INTO v_complimentary_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action = 'admit'
        AND (t.is_complementary = true OR (a.id IS NOT NULL AND a.distribution_category = 'complementary'))
    ) x;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN (SELECT COUNT(*) FROM public.event_seats es WHERE es.event_section_id = sec.id) > 0
      THEN (SELECT COUNT(*)::int FROM public.event_seats es WHERE es.event_section_id = sec.id)
      ELSE sec.capacity
    END
  ), 0) INTO v_total_capacity
  FROM public.event_sections sec
  WHERE sec.event_id = p_event_id;

  RETURN (
    WITH
    sec_sales AS (
      SELECT
        sec.id AS section_id,
        COALESCE(sec.section_code, sec.name) AS section_name,
        CASE WHEN es_cnt.cnt > 0 THEN es_cnt.cnt ELSE sec.capacity END AS capacity,
        COALESCE(sold.cnt, 0) AS sold_count,
        CASE WHEN (CASE WHEN COALESCE(es_cnt.cnt, 0) > 0 THEN es_cnt.cnt ELSE sec.capacity END) > 0
          THEN ROUND((COALESCE(sold.cnt, 0)::numeric / (CASE WHEN COALESCE(es_cnt.cnt, 0) > 0 THEN es_cnt.cnt ELSE sec.capacity END)) * 100, 1)
          ELSE 0 END AS sold_pct
      FROM public.event_sections sec
      LEFT JOIN (
        SELECT event_section_id, COUNT(*)::int AS cnt
        FROM public.event_seats
        WHERE event_id = p_event_id
        GROUP BY event_section_id
      ) es_cnt ON es_cnt.event_section_id = sec.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS cnt
        FROM public.tickets t
        JOIN public.bookings b ON b.id = t.booking_id
        LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        WHERE t.booking_id = ANY(v_booking_ids)
          AND a.id IS NULL
          AND COALESCE(t.is_complementary, false) = false
          AND (
            t.section_id = sec.id
            OR t.seat_id IN (SELECT id FROM public.event_seats WHERE event_section_id = sec.id)
          )
      ) sold ON true
      WHERE sec.event_id = p_event_id
    ),
    sec_vss AS (
      SELECT
        sec.id AS section_id,
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
        FROM public.event_seats
        WHERE event_id = p_event_id
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
    )
    SELECT jsonb_build_object(
      'event', jsonb_build_object(
        'id', v_event.id,
        'title', v_event.title,
        'event_start', v_event.event_start
      ),
      'is_event_day', v_is_event_day,
      'kpis', jsonb_build_object(
        'total_capacity', v_total_capacity,
        'gross_revenue_cents', v_gross_revenue,
        'total_sold', v_total_sold,
        'distributed', v_distributed,
        'complimentary', v_complimentary,
        'admitted', v_admitted,
        'occupancy_pct', CASE WHEN v_total_capacity > 0 THEN ROUND((v_occupied::numeric / v_total_capacity) * 100, 1) ELSE 0 END
      ),
      'payment_methods', jsonb_build_object(
        'paymongo_revenue_cents', v_paymongo_revenue,
        'onsite_revenue_cents', v_onsite_revenue,
        'total_revenue_cents', v_gross_revenue
      ),
      'sections_sales', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('section_id', section_id, 'section_name', section_name, 'capacity', capacity, 'sold_count', sold_count, 'sold_pct', sold_pct) ORDER BY sold_pct DESC NULLS LAST)
         FROM sec_sales),
        '[]'::jsonb
      ),
      'vss_breakdown', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'section_id', section_id,
          'section_name', section_name,
          'sold', sold,
          'distributed', distributed,
          'complimentary', complimentary,
          'available', GREATEST(0, cap - sold - distributed - complimentary)
        ) ORDER BY sort_order, sec_name)
         FROM sec_vss),
        '[]'::jsonb
      ),
      'event_day_data', CASE WHEN v_is_event_day THEN jsonb_build_object(
        'checkin_rate', CASE WHEN v_occupied > 0 THEN ROUND((v_admitted::numeric / v_occupied) * 100, 1) ELSE 0 END,
        'sold_admitted', v_sold_admitted,
        'distributed_admitted', v_distributed_admitted,
        'complimentary_admitted', v_complimentary_admitted
      ) ELSE NULL END
    )
    FROM (SELECT 1) _
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(uuid, date, date) TO authenticated;

-- Update get_admin_dashboard_drilldown: admitted shows one row per distinct ticket (first admission only)
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
          COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS sec_name,
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
          COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
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
          COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
          sec.sort_order,
          sec.name AS sec_name,
          (CASE WHEN COALESCE(es_cnt2.cnt, 0) > 0 THEN es_cnt2.cnt ELSE sec.capacity END) AS cap,
          COALESCE(vss.sold, 0)::int AS sold,
          COALESCE(vss.distributed, 0)::int AS distributed,
          COALESCE(vss.complimentary, 0)::int AS complimentary
        FROM public.event_sections sec
        LEFT JOIN (
          SELECT event_section_id, COUNT(*)::int AS cnt
          FROM public.event_seats
          WHERE event_id = p_event_id
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
        'ticket_id', sub.id,
        'assignment_id', sub.aid,
        'section_id', COALESCE(sub.es_sec_id, sub.sec_id),
        'section_name', sub.section_name,
        'row_label', sub.row_label,
        'seat_number', sub.seat_number,
        'recipient_name', COALESCE(sub.recipient_name, '—'),
        'recipient_email', COALESCE(NULLIF(TRIM(sub.recipient_email), ''), '—'),
        'quantity', COALESCE(sub.quantity, 1)::int
      ) ORDER BY sub.recipient_name, sub.recipient_email, sub.section_name, sub.row_label, sub.seat_number)
      INTO v_rows
      FROM (
        SELECT t.id, a.id AS aid, es_sec.id AS es_sec_id, sec.id AS sec_id,
          COALESCE(NULLIF(TRIM(es_sec.name), ''), es_sec.section_code, sec.name, 'Other') AS section_name,
          es.row_label, es.seat_number, a.recipient_name, a.recipient_email, t.quantity
        FROM public.tickets t
        JOIN public.bookings b ON b.id = t.booking_id
        JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        LEFT JOIN public.event_seats es ON es.id = t.seat_id
        LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es.event_section_id)
        LEFT JOIN public.sections sec ON sec.id = t.section_id
        WHERE t.booking_id = ANY(v_booking_ids)
          AND a.distribution_category = 'sales'
      ) sub;

    WHEN 'complimentary' THEN
      SELECT jsonb_agg(jsonb_build_object(
        'ticket_id', sub.id,
        'assignment_id', sub.aid,
        'section_id', COALESCE(sub.es_sec_id, sub.sec_id),
        'section_name', sub.section_name,
        'row_label', sub.row_label,
        'seat_number', sub.seat_number,
        'recipient_name', COALESCE(sub.recipient_name, '—'),
        'recipient_email', COALESCE(NULLIF(TRIM(sub.recipient_email), ''), '—'),
        'quantity', COALESCE(sub.quantity, 1)::int
      ) ORDER BY sub.recipient_name, sub.recipient_email, sub.section_name, sub.row_label, sub.seat_number)
      INTO v_rows
      FROM (
        SELECT t.id, a.id AS aid, es_sec.id AS es_sec_id, sec.id AS sec_id,
          COALESCE(NULLIF(TRIM(es_sec.name), ''), es_sec.section_code, sec.name, 'Other') AS section_name,
          es.row_label, es.seat_number,
          COALESCE(a.recipient_name, t.recipient_name, '—') AS recipient_name,
          COALESCE(NULLIF(TRIM(a.recipient_email), ''), '') AS recipient_email,
          t.quantity
        FROM public.tickets t
        JOIN public.bookings b ON b.id = t.booking_id
        LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
        LEFT JOIN public.event_seats es ON es.id = t.seat_id
        LEFT JOIN public.event_sections es_sec ON es_sec.id = COALESCE(t.section_id, es.event_section_id)
        LEFT JOIN public.sections sec ON sec.id = t.section_id
        WHERE t.booking_id = ANY(v_booking_ids)
          AND (t.is_complementary = true OR (a.id IS NOT NULL AND a.distribution_category = 'complementary'))
      ) sub;

    WHEN 'admitted' THEN
      -- One row per distinct ticket, first admission only (no re-entry return scans)
      SELECT jsonb_agg(jsonb_build_object(
        'section_name', section_name,
        'recipient_name', recipient_name,
        'checkin_time', checkin_time,
        'ticket_category', ticket_category,
        'row_label', row_label,
        'seat_number', seat_number
      ) ORDER BY checkin_time DESC)
      INTO v_rows
      FROM (
        SELECT DISTINCT ON (ar.ticket_id)
          COALESCE(NULLIF(TRIM(es_sec.name), ''), es_sec.section_code, sec.name, 'Other') AS section_name,
          COALESCE(t.recipient_name, a.recipient_name, p.full_name, '—') AS recipient_name,
          ar.created_at AS checkin_time,
          COALESCE(es.row_label, '—') AS row_label,
          COALESCE(es.seat_number, '—') AS seat_number,
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
          AND ar.action = 'admit'
        ORDER BY ar.ticket_id, ar.created_at ASC
      ) x;

    ELSE
      RETURN jsonb_build_object('error', 'Invalid metric');
  END CASE;

  RETURN jsonb_build_object('rows', COALESCE(v_rows, '[]'::jsonb));
END;
$$;
