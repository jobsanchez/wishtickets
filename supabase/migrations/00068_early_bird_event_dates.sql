-- Early bird: single start/end dates per event (stored on events)
-- Replaces per-section cutoff_at in early_bird_prices

-- 1. Add event-level early bird dates
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS early_bird_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS early_bird_ends_at timestamptz;

-- 2. Backfill from existing early_bird_prices
UPDATE public.events e
SET
  early_bird_ends_at = sub.max_cutoff,
  early_bird_starts_at = COALESCE(
    sub.max_cutoff - interval '30 days',
    e.event_start - interval '30 days',
    '2020-01-01 00:00:00+00'::timestamptz
  )
FROM (
  SELECT event_id, MAX(cutoff_at) AS max_cutoff
  FROM public.early_bird_prices
  GROUP BY event_id
) sub
WHERE e.id = sub.event_id AND e.early_bird_ends_at IS NULL;

-- 3. Drop cutoff_at from early_bird_prices
ALTER TABLE public.early_bird_prices DROP COLUMN IF EXISTS cutoff_at;
