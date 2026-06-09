-- 750×1650 PNG ticket templates often exceed 2 MB; align with generous client/API limit
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'ticket-templates';
