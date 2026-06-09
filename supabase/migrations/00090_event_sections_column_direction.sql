-- Persist seat column direction (left-to-right vs right-to-left) for display
ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS column_direction text DEFAULT 'left-to-right';

COMMENT ON COLUMN public.event_sections.column_direction IS 'Seat number direction: left-to-right (1,2,3...) or right-to-left (10,9,8...). Affects grid display order.';
