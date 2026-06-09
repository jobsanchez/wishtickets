-- Allow teaser video uploads in event-images bucket (phase 1).
-- Keep bucket public for playback while adding mp4/webm MIME support and a larger size cap.

UPDATE storage.buckets
SET
  file_size_limit = 209715200, -- 200 MB
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
WHERE id = 'event-images';
