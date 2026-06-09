-- Ticket images are now generated as JPEG.
-- Keep PNG allowed for legacy/object compatibility while accepting new JPEG uploads.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg']
WHERE id = 'ticket-images';

