-- Cart time duration per event (minutes). Default 15.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cart_time_duration_minutes int DEFAULT 15;

-- Backfill nulls
UPDATE public.events SET cart_time_duration_minutes = 15 WHERE cart_time_duration_minutes IS NULL;

-- Drop old overload and create new one with cart_time_duration
DROP FUNCTION IF EXISTS public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid);

-- Recreate update_admin_event to include cart_time_duration_minutes
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
      cart_time_duration_minutes = greatest(1, least(120, coalesce(p_cart_time_duration_minutes, 15)))
  WHERE id = p_id;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid, int) TO authenticated;
