-- Add color column to event_sections for assigned seating section display
ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS color text;

COMMENT ON COLUMN public.event_sections.color IS 'Hex color for assigned seating section display (e.g. #22c55e). Used in seat configurator and buyer view.';
