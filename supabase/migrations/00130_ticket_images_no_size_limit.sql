-- Remove file size limit for ticket-images bucket (was 5MB in 00129)
-- Global Supabase limit still applies; bucket will accept up to that
UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'ticket-images';
