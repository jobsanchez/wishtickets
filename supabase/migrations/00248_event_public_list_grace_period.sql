-- Public event listings: stay visible through the day after the event (Asia/Manila),
-- not only until showtime (event_start >= now()).

CREATE OR REPLACE FUNCTION public.event_is_publicly_listed(p_event_start timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Manila')::date
      <= ((p_event_start AT TIME ZONE 'Asia/Manila')::date + 1);
$$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS public_list_visible_until date
  GENERATED ALWAYS AS (
    ((event_start AT TIME ZONE 'Asia/Manila')::date + 1)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_events_published_public_list_visible_until
  ON public.events (status, public_list_visible_until, event_start)
  WHERE status = 'published';

CREATE OR REPLACE FUNCTION public.get_upcoming_events(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 18,
  p_offset int DEFAULT 0
)
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.events
  WHERE status = 'published'
    AND public.event_is_publicly_listed(event_start)
    AND (p_category IS NULL OR p_category = 'all' OR category = p_category)
    AND (p_search IS NULL OR p_search = '' OR title ILIKE '%' || p_search || '%')
  ORDER BY featured DESC NULLS LAST, event_start ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 18), 100))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

CREATE OR REPLACE FUNCTION public.get_upcoming_events_count(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events
  WHERE status = 'published'
    AND public.event_is_publicly_listed(event_start)
    AND (p_category IS NULL OR p_category = 'all' OR category = p_category)
    AND (p_search IS NULL OR p_search = '' OR title ILIKE '%' || p_search || '%');
$$;

CREATE OR REPLACE FUNCTION public.get_home_banner_carousel_rows()
RETURNS TABLE (
  banner_id uuid,
  event_slug text,
  event_title text,
  image_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    eb.id AS banner_id,
    e.slug AS event_slug,
    e.title AS event_title,
    eb.image_url
  FROM public.event_banners eb
  INNER JOIN public.events e ON e.id = eb.event_id
  WHERE eb.is_active = true
    AND e.status = 'published'
    AND public.event_is_publicly_listed(e.event_start)
  ORDER BY
    e.featured DESC NULLS LAST,
    e.event_start ASC,
    eb.sort_order ASC
  LIMIT 50;
$$;

DROP POLICY IF EXISTS "Public read home carousel event_banners" ON public.event_banners;
CREATE POLICY "Public read home carousel event_banners"
  ON public.event_banners
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_banners.event_id
        AND e.status = 'published'
        AND public.event_is_publicly_listed(e.event_start)
    )
  );
