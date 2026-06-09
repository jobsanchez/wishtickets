-- Add thumbnail_url to events for card thumbnails, separate from full image_url.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- Backfill: use existing image_url as thumbnail where thumbnail_url is null.
UPDATE public.events
SET thumbnail_url = image_url
WHERE thumbnail_url IS NULL
  AND image_url IS NOT NULL;

-- Update update_admin_event RPC to accept thumbnail_url.
DROP FUNCTION IF EXISTS public.update_admin_event(
  uuid, text, text, text, text, text, text, text, timestamptz, uuid
);

DROP FUNCTION IF EXISTS public.update_admin_event(
  uuid, text, text, text, text, text, text, text, timestamptz, uuid, int
);

DROP FUNCTION IF EXISTS public.update_admin_event(
  uuid, text, text, text, text, text, text, text, timestamptz, uuid, int, uuid
);

CREATE OR REPLACE FUNCTION public.update_admin_event(
  p_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category text,
  p_status text,
  p_image_url text,
  p_thumbnail_url text,
  p_teaser_video_url text,
  p_event_start timestamptz,
  p_venue_id uuid,
  p_cart_time_duration_minutes int DEFAULT 15,
  p_producer_id uuid DEFAULT NULL
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
  SET title = p_title,
      slug = p_slug,
      description = p_description,
      short_description = left(p_description, 200),
      category = p_category,
      status = p_status::text,
      image_url = p_image_url,
      thumbnail_url = p_thumbnail_url,
      teaser_video_url = p_teaser_video_url,
      event_start = p_event_start,
      venue_id = p_venue_id,
      cart_time_duration_minutes = greatest(
        1,
        least(120, coalesce(p_cart_time_duration_minutes, 15))
      ),
      producer_id = p_producer_id
  WHERE id = p_id;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(
  uuid, text, text, text, text, text, text, text, text, timestamptz, uuid, int, uuid
) TO authenticated;

