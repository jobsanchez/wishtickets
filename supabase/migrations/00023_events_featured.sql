ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
