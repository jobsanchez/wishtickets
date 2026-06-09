-- Event images bucket and policies for Supabase Storage.
-- If bucket creation fails (e.g. on hosted Supabase), create manually via Dashboard.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Public read for event images
CREATE POLICY "Public read event images"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-images');

-- Admin and manage_events can upload
CREATE POLICY "Admins can upload event images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'event-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

-- Admin and manage_events can update
CREATE POLICY "Admins can update event images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'event-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);

-- Admin and manage_events can delete
CREATE POLICY "Admins can delete event images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'event-images'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
  )
);
