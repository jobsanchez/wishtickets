-- Home page carousel banners: multiple images per event, dedicated Storage bucket.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.event_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_banners_event_id_sort_order_idx
  ON public.event_banners (event_id, sort_order);

ALTER TABLE public.event_banners ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated): read only active banners tied to upcoming published events.
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
        AND e.event_start >= now()
    )
  );

-- Staff: full access when authorized for this event.
CREATE POLICY "Authorized staff manage event_banners"
  ON public.event_banners
  FOR ALL
  TO authenticated
  USING (public.is_authorized_for_event(event_id))
  WITH CHECK (public.is_authorized_for_event(event_id));

-- ---------------------------------------------------------------------------
-- RPC for home page (SECURITY DEFINER; stable ordering).
-- ---------------------------------------------------------------------------
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
    AND e.event_start >= now()
  ORDER BY
    e.featured DESC NULLS LAST,
    e.event_start ASC,
    eb.sort_order ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_banner_carousel_rows() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: event-banners bucket + policies (mirrors event-images pattern).
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-banners',
  'event-banners',
  true,
  26214400, -- 25 MiB pre-Sharp (same ceiling as event-images)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

CREATE POLICY "Public read event carousel banners storage"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-banners');

CREATE POLICY "Admins can upload event carousel banners storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-banners'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

CREATE POLICY "Admins can update event carousel banners storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'event-banners'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

CREATE POLICY "Admins can delete event carousel banners storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-banners'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);
