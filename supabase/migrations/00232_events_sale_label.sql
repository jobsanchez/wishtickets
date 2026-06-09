-- Custom ribbon text on event cards during active sale window (Seat Pricing → Sale Label).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sale_label text;
