-- Add seat_map_image_urls for overall seat map images (buyer view)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS seat_map_image_urls text[] DEFAULT '{}';
