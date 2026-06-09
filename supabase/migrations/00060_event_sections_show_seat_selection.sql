-- Per-section control: show visual seat map (true) or default row/column grid (false) on buyer side

ALTER TABLE public.event_sections
  ADD COLUMN IF NOT EXISTS show_seat_selection boolean DEFAULT true;
