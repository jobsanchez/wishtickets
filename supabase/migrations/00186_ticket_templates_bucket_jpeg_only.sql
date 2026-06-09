-- Ticket templates now require JPEG (.jpg) uploads in admin UI/API.
-- Align storage bucket MIME allowlist with server-side validation.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg']
WHERE id = 'ticket-templates';

