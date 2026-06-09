-- Multiple canvases: users can add/remove canvases; each canvas has an image and assigned sections
CREATE TABLE IF NOT EXISTS public.event_layout_canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  image_url text,
  scale real DEFAULT 1,
  opacity real DEFAULT 0.5,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_layout_canvases_event_id ON public.event_layout_canvases(event_id);

ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS seat_layout_canvas_id uuid REFERENCES public.event_layout_canvases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_sections_seat_layout_canvas_id ON public.event_sections(seat_layout_canvas_id);

COMMENT ON TABLE public.event_layout_canvases IS 'Layout canvases for seat selector. Each canvas has one background image and can have multiple sections assigned.';
COMMENT ON COLUMN public.event_sections.seat_layout_canvas_id IS 'When set, section uses this canvas image and seats are positioned on that canvas. Falls back to seat_layout_image_url when null.';
