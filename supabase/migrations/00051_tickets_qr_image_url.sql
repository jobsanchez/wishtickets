-- Add qr_image_url to tickets (public URL of stored QR PNG)
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS qr_image_url text;

-- Ticket QR images bucket (public read for attendee display)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-qr',
  'ticket-qr',
  true,
  51200,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 51200,
  allowed_mime_types = ARRAY['image/png'];

-- Public read for ticket QR images
CREATE POLICY "Public read ticket QR images"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-qr');

-- Authenticated and service role can upload (checkout and admin confirm use auth; helper uses service role)
CREATE POLICY "Service and auth can upload ticket QR"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-qr'
  AND (auth.role() = 'authenticated' OR auth.role() = 'service_role')
);
