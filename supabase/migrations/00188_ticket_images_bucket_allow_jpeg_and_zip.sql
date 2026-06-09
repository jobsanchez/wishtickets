-- Keep ticket-images compatible with:
-- - legacy PNG ticket files
-- - new JPEG ticket files
-- - generated ZIP bundles for print-folder jobs
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'application/zip']
WHERE id = 'ticket-images';

