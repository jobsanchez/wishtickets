-- Update get_admin_events: sort by nearest date (soonest first)
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
  ORDER BY e.event_start ASC;
$$;

-- Drop old 10-param version before creating 11-param overload
DROP FUNCTION IF EXISTS public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid);

-- Extend update_admin_event with p_featured
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
  p_featured boolean DEFAULT NULL
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
      event_start = p_event_start, venue_id = p_venue_id,
      featured = COALESCE(p_featured, featured)
  WHERE id = p_id;
  RETURN p_id;
END;
$$;

-- Overload for featured-only update (used by PATCH /api/admin/events/[id]/featured)
CREATE OR REPLACE FUNCTION public.update_admin_event_featured(p_id uuid, p_featured boolean)
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
  UPDATE public.events SET featured = p_featured WHERE id = p_id;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_event_featured(uuid, boolean) TO authenticated;
