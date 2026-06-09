-- Track who created each event (for notifications and auditing).
-- Nullable for legacy rows; new events set this from the API.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events(created_by);
