-- Per-section seat layout: background image, scale, opacity for each section
ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS seat_layout_image_url text,
  ADD COLUMN IF NOT EXISTS seat_layout_scale real DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seat_layout_opacity real DEFAULT 0.5;

COMMENT ON COLUMN public.event_sections.seat_layout_image_url IS 'Optional background image URL for this section in the seat selector. Falls back to events.seat_layout_image_url when null.';
COMMENT ON COLUMN public.event_sections.seat_layout_scale IS 'Scale factor for section background image. Default 1.';
COMMENT ON COLUMN public.event_sections.seat_layout_opacity IS 'Opacity 0-1 for section background image. Default 0.5.';
