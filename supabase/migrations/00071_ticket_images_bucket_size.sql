-- Increase ticket-images bucket file size limit (797x1500 PNG can exceed 512KB)
UPDATE storage.buckets
SET file_size_limit = 2097152
WHERE id = 'ticket-images';
