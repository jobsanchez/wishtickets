-- Fix events_status_check: allow all event statuses used by the app
-- (draft, published, postponed, cancelled, archived)
-- The constraint may have been created with only draft/published; this expands it.
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check CHECK (
    status IN ('draft', 'published', 'postponed', 'cancelled', 'archived')
  );
