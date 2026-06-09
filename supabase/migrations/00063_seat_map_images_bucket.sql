-- Seat map images bucket for overall venue/seat map photos (buyer view)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'seat-map-images',
  'seat-map-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Public read for seat map images
CREATE POLICY "Public read seat map images"
ON storage.objects FOR SELECT
USING (bucket_id = 'seat-map-images');

-- Admin and manage_events can upload
CREATE POLICY "Admins can upload seat map images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'seat-map-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

-- Admin and manage_events can update
CREATE POLICY "Admins can update seat map images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'seat-map-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

-- Admin and manage_events can delete
CREATE POLICY "Admins can delete seat map images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'seat-map-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);
