-- Event Administrator Assignments
-- Super admin assigns users to events; admins/manage_events see only assigned events.

-- 1. event_administrators table
CREATE TABLE IF NOT EXISTS public.event_administrators (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_event_administrators_user ON public.event_administrators(user_id);
CREATE INDEX idx_event_administrators_event ON public.event_administrators(event_id);

ALTER TABLE public.event_administrators ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all; others can read own rows
CREATE POLICY "Super admin can manage event_administrators" ON public.event_administrators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

CREATE POLICY "Users can read own event_administrators" ON public.event_administrators
  FOR SELECT USING (user_id = auth.uid());

-- 2. Helper: true if super_admin OR (admin/manage_events AND assigned to event)
CREATE OR REPLACE FUNCTION public.is_authorized_for_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'super_admin'
  )
  OR (
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id AND ea.user_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_for_event(uuid) TO authenticated;

-- 3. get_admin_events: super_admin sees all; admin/manage_events see only assigned
CREATE OR REPLACE FUNCTION public.get_admin_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.*
  FROM public.events e
  WHERE (
    -- Super admin: all events
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  OR (
    -- Admin or manage_events: only assigned events
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (SELECT 1 FROM public.event_administrators ea WHERE ea.event_id = e.id AND ea.user_id = auth.uid())
  )
  ORDER BY e.featured DESC NULLS LAST, e.event_start ASC;
$$;

-- 4. get_admin_events_count
CREATE OR REPLACE FUNCTION public.get_admin_events_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events e
  WHERE (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  OR (
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (SELECT 1 FROM public.event_administrators ea WHERE ea.event_id = e.id AND ea.user_id = auth.uid())
  );
$$;

-- 5. get_admin_event_by_id
CREATE OR REPLACE FUNCTION public.get_admin_event_by_id(p_id uuid)
RETURNS public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.*
  FROM public.events e
  WHERE e.id = p_id
  AND public.is_authorized_for_event(p_id)
  LIMIT 1;
$$;

-- 6. update_admin_event (11-param with cart_time_duration from 00059)
CREATE OR REPLACE FUNCTION public.update_admin_event(
  p_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category text,
  p_status text,
  p_image_url text,
  p_teaser_video_url text,
  p_event_start timestamptz,
  p_venue_id uuid,
  p_cart_time_duration_minutes int DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_authorized_for_event(p_id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.events
  SET title = p_title, slug = p_slug, description = p_description,
      short_description = left(p_description, 200), category = p_category,
      status = p_status::text, image_url = p_image_url, teaser_video_url = p_teaser_video_url,
      event_start = p_event_start, venue_id = p_venue_id,
      cart_time_duration_minutes = greatest(1, least(120, coalesce(p_cart_time_duration_minutes, 15)))
  WHERE id = p_id;
  RETURN p_id;
END;
$$;

-- 7. update_admin_event_featured
CREATE OR REPLACE FUNCTION public.update_admin_event_featured(p_id uuid, p_featured boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_authorized_for_event(p_id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.events SET featured = p_featured WHERE id = p_id;
  RETURN p_id;
END;
$$;

-- 8. get_admin_seat_assignments: return empty if not authorized
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

-- 9. event_admissions_codes: event admins can only manage codes for assigned events
DROP POLICY IF EXISTS "Admin can manage event_admissions_codes" ON public.event_admissions_codes;
CREATE POLICY "Admin can manage event_admissions_codes" ON public.event_admissions_codes
  FOR ALL USING (
    public.is_authorized_for_event(event_id)
  );

-- 10. event_sections, event_seats, event_prices, promo_codes, early_bird_prices: event-scoped
DROP POLICY IF EXISTS "Admin can manage event_sections" ON public.event_sections;
CREATE POLICY "Admin can manage event_sections" ON public.event_sections
  FOR ALL USING (public.is_authorized_for_event(event_id));

DROP POLICY IF EXISTS "Admin can manage event_seats" ON public.event_seats;
CREATE POLICY "Admin can manage event_seats" ON public.event_seats
  FOR ALL USING (public.is_authorized_for_event(event_id));

DROP POLICY IF EXISTS "Admin can manage event_prices" ON public.event_prices;
CREATE POLICY "Admin can manage event_prices" ON public.event_prices
  FOR ALL USING (public.is_authorized_for_event(event_id));

DROP POLICY IF EXISTS "Admin can manage promo_codes" ON public.promo_codes;
CREATE POLICY "Admin can manage promo_codes" ON public.promo_codes
  FOR ALL USING (
    event_id IS NULL
    OR public.is_authorized_for_event(event_id)
  );

DROP POLICY IF EXISTS "Admin can manage early_bird_prices" ON public.early_bird_prices;
CREATE POLICY "Admin can manage early_bird_prices" ON public.early_bird_prices
  FOR ALL USING (public.is_authorized_for_event(event_id));

-- event_seat_layout: schema unclear; keep original 00092 policy (no event_id filter)
