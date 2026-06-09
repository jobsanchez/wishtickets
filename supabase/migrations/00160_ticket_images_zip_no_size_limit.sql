-- Large bulk-print ZIPs (100+ PNGs) can exceed default bucket limits; keep PNG + ZIP allowed with no per-object cap.
-- (Project/plan limits may still apply upstream.)
UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY['image/png', 'application/zip']::text[],
  file_size_limit = NULL
WHERE id = 'ticket-images';
