-- Persist the top-level Seat Pricing early-bird toggle state.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS early_bird_enabled boolean NOT NULL DEFAULT false;
