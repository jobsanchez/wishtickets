-- Seat layout config for event: background reference image (e.g. venue seating plan).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS seat_layout_image_url text,
  ADD COLUMN IF NOT EXISTS seat_layout_scale real DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seat_layout_opacity real DEFAULT 0.5;
