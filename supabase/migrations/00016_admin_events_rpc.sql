-- RPC for admin to fetch all events. Bypasses RLS; auth check uses role or manage_events capability.
CREATE OR REPLACE FUNCTION public.get_admin_events()
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.*
  FROM public.events e
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'
  )
  ORDER BY e.event_start DESC;
$$;

-- Count for dashboard (same auth check)
CREATE OR REPLACE FUNCTION public.get_admin_events_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events e
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'
  );
$$;

-- Bookings count for dashboard (admin/staff or view_sales_analytics)
CREATE OR REPLACE FUNCTION public.get_admin_bookings_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.bookings b
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics'
  );
$$;

-- Bookings list for reports (with event join via JSON)
CREATE OR REPLACE FUNCTION public.get_admin_bookings(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  status text,
  total_cents int,
  created_at timestamptz,
  event_title text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT b.id, b.status, b.total_cents, b.created_at, e.title AS event_title
  FROM public.bookings b
  LEFT JOIN public.events e ON e.id = b.event_id
  WHERE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher')
  )
  OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc
    WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics'
  )
  ORDER BY b.created_at DESC
  LIMIT p_limit;
$$;

-- Single event by ID for edit page (same auth as get_admin_events)
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
  AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events')
  )
  LIMIT 1;
$$;

-- Update event (same auth as get_admin_event_by_id)
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
  p_venue_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events')
  ) THEN
    RETURN NULL;
  END IF;
  UPDATE public.events
  SET title = p_title, slug = p_slug, description = p_description,
      short_description = left(p_description, 200), category = p_category,
      status = p_status::text, image_url = p_image_url, teaser_video_url = p_teaser_video_url,
      event_start = p_event_start, venue_id = p_venue_id
  WHERE id = p_id;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_event_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_events_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_bookings_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_bookings(int) TO authenticated;
