-- Add grid positioning columns to event_seats for spatial seat layout (aircraft-style).
-- When null, buyer UI derives layout from row_label + seat_number as fallback.

ALTER TABLE public.event_seats
  ADD COLUMN IF NOT EXISTS grid_x int,
  ADD COLUMN IF NOT EXISTS grid_y int;
