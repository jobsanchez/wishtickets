-- Custom ticket templates produce larger composites; 797x1500 PNG can exceed 2MB
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'ticket-images';
