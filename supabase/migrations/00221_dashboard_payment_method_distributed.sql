-- Payment method distribution: add distributed (manual sales) face-value total and exclude
-- those bookings from online/onsite booking-total splits so the donut slices are mutually exclusive.

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
  v_distributed_recipient_names text;
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
    AND EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.booking_id = b.id
    )
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  SELECT COALESCE(SUM(b.total_cents), 0) INTO v_gross_revenue
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.booking_id = b.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_seat_assignments a_ex
      WHERE a_ex.booking_id = b.id
        AND a_ex.distribution_category = 'complementary'
    )
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  SELECT
    COALESCE(SUM(CASE WHEN b.accepted_by_admin_id IS NULL THEN b.total_cents ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.accepted_by_admin_id IS NOT NULL THEN b.total_cents ELSE 0 END), 0)
  INTO v_paymongo_revenue, v_onsite_revenue
  FROM public.bookings b
  WHERE b.event_id = p_event_id AND b.status = 'confirmed'
    AND EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.booking_id = b.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_seat_assignments a_ex
      WHERE a_ex.booking_id = b.id
        AND a_ex.distribution_category = 'complementary'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.admin_seat_assignments a_sales
      WHERE a_sales.booking_id = b.id
        AND a_sales.distribution_category = 'sales'
    )
    AND (p_date_from IS NULL OR b.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR b.created_at::date <= p_date_to);

  IF array_length(v_booking_ids, 1) > 0 THEN
    WITH ticket_cat AS (
      SELECT
        CASE
          WHEN a.id IS NOT NULL AND a.distribution_category = 'complimentary' THEN 'complimentary'
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

  SELECT string_agg(sub.nm, ', ' ORDER BY sub.nm)
  INTO v_distributed_recipient_names
  FROM (
    SELECT DISTINCT NULLIF(TRIM(a.recipient_name), '') AS nm
    FROM public.admin_seat_assignments a
    WHERE a.booking_id = ANY(v_booking_ids)
      AND a.distribution_category = 'sales'
      AND NULLIF(TRIM(a.recipient_name), '') IS NOT NULL
  ) sub;

  SELECT COUNT(*)::int INTO v_admitted
  FROM (
    SELECT DISTINCT ar.ticket_id
    FROM public.admission_records ar
    WHERE ar.event_id = p_event_id
      AND ar.action IN ('admit', 're_entry_granted')
  ) x;

  IF v_is_event_day THEN
    SELECT COUNT(*)::int INTO v_sold_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action IN ('admit', 're_entry_granted')
        AND a.id IS NULL AND COALESCE(t.is_complementary, false) = false
    ) x;

    SELECT COUNT(*)::int INTO v_distributed_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action IN ('admit', 're_entry_granted')
        AND a.distribution_category = 'sales'
    ) x;

    SELECT COUNT(*)::int INTO v_complimentary_admitted
    FROM (
      SELECT DISTINCT ar.ticket_id
      FROM public.admission_records ar
      JOIN public.tickets t ON t.id = ar.ticket_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = t.booking_id
      WHERE ar.event_id = p_event_id AND ar.action IN ('admit', 're_entry_granted')
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
    sold_ticket_revenue AS (
      SELECT
        COALESCE(t.section_id, es.event_section_id) AS section_id,
        (b.total_cents::numeric / NULLIF(COUNT(*) OVER (PARTITION BY b.id), 0)) AS revenue_per_ticket
      FROM public.tickets t
      JOIN public.bookings b ON b.id = t.booking_id
      LEFT JOIN public.admin_seat_assignments a ON a.booking_id = b.id
      LEFT JOIN public.event_seats es ON es.id = t.seat_id AND es.event_id = p_event_id
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN a.id IS NOT NULL AND a.distribution_category = 'complimentary' THEN 'complimentary'
          WHEN t.is_complementary THEN 'complimentary'
          WHEN a.id IS NOT NULL AND a.distribution_category = 'sales' THEN 'distributed'
          ELSE 'sold'
        END AS cat
      ) tc
      WHERE t.booking_id = ANY(v_booking_ids)
        AND tc.cat = 'sold'
        AND (t.section_id IS NOT NULL OR t.seat_id IS NOT NULL)
    ),
    sold_by_section AS (
      SELECT section_id, SUM(revenue_per_ticket)::bigint AS amount_paid_cents
      FROM sold_ticket_revenue
      WHERE section_id IS NOT NULL
      GROUP BY section_id
    ),
    sec_sales AS (
      SELECT
        sec.id AS section_id,
        COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
        sec.color AS section_color,
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
        COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
        sec.color AS section_color,
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
            WHEN a.id IS NOT NULL AND a.distribution_category = 'complimentary' THEN 'complimentary'
            WHEN t.is_complementary THEN 'complimentary'
            WHEN a.id IS NOT NULL AND a.distribution_category = 'sales' THEN 'distributed'
            ELSE 'sold'
          END AS cat
        ) tc
        WHERE t.booking_id = ANY(v_booking_ids)
          AND (t.section_id = sec.id OR t.seat_id IN (SELECT id FROM public.event_seats WHERE event_section_id = sec.id))
      ) vss ON true
      WHERE sec.event_id = p_event_id
    ),
    priority_guests_raw AS (
      SELECT
        COALESCE(t.section_id, es.event_section_id) AS section_id,
        COALESCE(t.quantity, 1)::int AS qty,
        b.special_request_type,
        b.special_request_details
      FROM public.tickets t
      JOIN public.bookings b ON b.id = t.booking_id
      LEFT JOIN public.event_seats es ON es.id = t.seat_id AND es.event_id = p_event_id
      WHERE t.booking_id = ANY(v_booking_ids)
        AND COALESCE(b.special_request_type, 'none') <> 'none'
        AND (t.section_id IS NOT NULL OR t.seat_id IS NOT NULL)
    ),
    priority_guests_by_section AS (
      SELECT
        sec.id AS section_id,
        COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
        sec.color AS section_color,
        sec.sort_order,
        sec.name AS sec_name,
        COALESCE(SUM(CASE WHEN pg.special_request_type = 'pwd' THEN pg.qty ELSE 0 END), 0)::int AS pwd,
        COALESCE(SUM(CASE WHEN pg.special_request_type = 'senior_citizen' THEN pg.qty ELSE 0 END), 0)::int AS senior_citizen,
        COALESCE(SUM(CASE WHEN pg.special_request_type = 'pregnant' THEN pg.qty ELSE 0 END), 0)::int AS pregnant,
        COALESCE(SUM(CASE WHEN pg.special_request_type = 'others' THEN pg.qty ELSE 0 END), 0)::int AS others
      FROM priority_guests_raw pg
      JOIN public.event_sections sec ON sec.id = pg.section_id AND sec.event_id = p_event_id
      GROUP BY sec.id, sec.name, sec.section_code, sec.color, sec.sort_order
    ),
    sec_revenue AS (
      SELECT
        sec.id AS section_id,
        COALESCE(NULLIF(TRIM(sec.name), ''), sec.section_code, 'Other') AS section_name,
        sec.sort_order,
        sec.name AS sec_name,
        COALESCE(sb.amount_paid_cents, 0)::bigint AS amount_paid_cents,
        (COALESCE(vss.distributed, 0) * COALESCE(ep.price_cents, 0))::bigint AS distributed_value_cents,
        (COALESCE(vss.complimentary, 0) * COALESCE(ep.price_cents, 0))::bigint AS complimentary_value_cents,
        GREATEST(0, COALESCE(vss.cap, 0) * COALESCE(ep.price_cents, 0) - COALESCE(vss.complimentary, 0) * COALESCE(ep.price_cents, 0))::bigint AS projected_revenue_cents
      FROM public.event_sections sec
      LEFT JOIN sold_by_section sb ON sb.section_id = sec.id
      LEFT JOIN sec_vss vss ON vss.section_id = sec.id
      LEFT JOIN public.event_prices ep ON ep.event_id = p_event_id AND ep.section_id = sec.id
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
        'total_projected_revenue_cents', COALESCE((SELECT SUM(projected_revenue_cents)::bigint FROM sec_revenue), 0),
        'total_sold', v_total_sold,
        'distributed', v_distributed,
        'distributed_recipient_names', v_distributed_recipient_names,
        'complimentary', v_complimentary,
        'admitted', v_admitted,
        'occupancy_pct', CASE WHEN v_total_capacity > 0 THEN ROUND((v_occupied::numeric / v_total_capacity) * 100, 1) ELSE 0 END
      ),
      'payment_methods', jsonb_build_object(
        'paymongo_revenue_cents', v_paymongo_revenue,
        'onsite_revenue_cents', v_onsite_revenue,
        'distributed_revenue_cents', COALESCE((SELECT SUM(distributed_value_cents)::bigint FROM sec_revenue), 0),
        'total_revenue_cents',
          v_paymongo_revenue + v_onsite_revenue + COALESCE((SELECT SUM(distributed_value_cents)::bigint FROM sec_revenue), 0)
      ),
      'sections_sales', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('section_id', section_id, 'section_name', section_name, 'section_color', section_color, 'capacity', capacity, 'sold_count', sold_count, 'sold_pct', sold_pct) ORDER BY sold_pct DESC NULLS LAST)
         FROM sec_sales),
        '[]'::jsonb
      ),
      'vss_breakdown', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'section_id', section_id,
          'section_name', section_name,
          'section_color', section_color,
          'sold', sold,
          'distributed', distributed,
          'complimentary', complimentary,
          'available', GREATEST(0, cap - sold - distributed - complimentary)
        ) ORDER BY sort_order, sec_name)
         FROM sec_vss),
        '[]'::jsonb
      ),
      'section_revenue', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'section_id', section_id,
          'section_name', section_name,
          'amount_paid_cents', amount_paid_cents,
          'distributed_value_cents', distributed_value_cents,
          'complimentary_value_cents', complimentary_value_cents,
          'projected_revenue_cents', projected_revenue_cents
        ) ORDER BY sort_order, sec_name)
         FROM sec_revenue),
        '[]'::jsonb
      ),
      'priority_guests', jsonb_build_object(
        'ticket_total', COALESCE((SELECT SUM(qty)::bigint FROM priority_guests_raw), 0),
        'pwd_total', COALESCE((SELECT SUM(CASE WHEN special_request_type = 'pwd' THEN qty ELSE 0 END)::bigint FROM priority_guests_raw), 0),
        'senior_citizen_total', COALESCE((SELECT SUM(CASE WHEN special_request_type = 'senior_citizen' THEN qty ELSE 0 END)::bigint FROM priority_guests_raw), 0),
        'pregnant_total', COALESCE((SELECT SUM(CASE WHEN special_request_type = 'pregnant' THEN qty ELSE 0 END)::bigint FROM priority_guests_raw), 0),
        'others_total', COALESCE((SELECT SUM(CASE WHEN special_request_type = 'others' THEN qty ELSE 0 END)::bigint FROM priority_guests_raw), 0),
        'by_section', COALESCE(
          (SELECT jsonb_agg(jsonb_build_object(
            'section_id', section_id,
            'section_name', section_name,
            'section_color', section_color,
            'pwd', pwd,
            'senior_citizen', senior_citizen,
            'pregnant', pregnant,
            'others', others
          ) ORDER BY sort_order, sec_name)
           FROM priority_guests_by_section
           WHERE (pwd + senior_citizen + pregnant + others) > 0),
          '[]'::jsonb
        )
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
