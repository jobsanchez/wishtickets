-- Bulk print ticket ZIPs upload to ticket-images; bucket previously allowed PNG only.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'application/zip']::text[]
WHERE id = 'ticket-images';
