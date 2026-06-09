-- Ticket template image URL on events (admin-uploaded 797x1500 PNG)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_template_image_url text;

-- Full ticket image URL on tickets (generated PNG with template + data overlay)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ticket_image_url text;

-- Ticket templates bucket (admin uploads 797x1500 PNG per event)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-templates',
  'ticket-templates',
  true,
  2097152,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png'];

-- Public read for ticket templates
DROP POLICY IF EXISTS "Public read ticket templates" ON storage.objects;
CREATE POLICY "Public read ticket templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-templates');

-- Admins can upload ticket templates
DROP POLICY IF EXISTS "Admins can upload ticket templates" ON storage.objects;
CREATE POLICY "Admins can upload ticket templates"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-templates'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
    OR public.current_user_has_capability('manage_ticket_templates')
  )
);

-- Admins can update ticket templates
DROP POLICY IF EXISTS "Admins can update ticket templates" ON storage.objects;
CREATE POLICY "Admins can update ticket templates"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ticket-templates'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
    OR public.current_user_has_capability('manage_ticket_templates')
  )
);

-- Admins can delete ticket templates
DROP POLICY IF EXISTS "Admins can delete ticket templates" ON storage.objects;
CREATE POLICY "Admins can delete ticket templates"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ticket-templates'
  AND auth.role() = 'authenticated'
  AND (
    COALESCE(public.get_my_role(), '') IN ('admin', 'super_admin')
    OR public.current_user_has_capability('manage_events')
    OR public.current_user_has_capability('manage_ticket_templates')
  )
);

-- Ticket images bucket (generated full ticket PNGs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-images',
  'ticket-images',
  true,
  524288,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 524288,
  allowed_mime_types = ARRAY['image/png'];

-- Public read for ticket images
DROP POLICY IF EXISTS "Public read ticket images" ON storage.objects;
CREATE POLICY "Public read ticket images"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-images');

-- Service role and authenticated can upload (checkout, admin confirm)
DROP POLICY IF EXISTS "Service and auth can upload ticket images" ON storage.objects;
CREATE POLICY "Service and auth can upload ticket images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-images'
  AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
);
