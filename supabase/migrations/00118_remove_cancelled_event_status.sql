-- Remove 'cancelled' from allowed event statuses.
-- 1. Migrate existing cancelled events to archived.
-- 2. Update check constraint to disallow cancelled.

UPDATE public.events
SET status = 'archived'
WHERE status = 'cancelled';

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check CHECK (
    status IN ('draft', 'published', 'postponed', 'archived')
  );
