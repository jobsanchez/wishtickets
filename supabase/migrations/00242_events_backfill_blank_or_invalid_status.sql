-- Harden event status values used by the public book page.
-- Includes NULL, blank/whitespace, and non-canonical values.
UPDATE public.events
SET status = 'draft'
WHERE status IS NULL
   OR BTRIM(status) = ''
   OR LOWER(BTRIM(status)) NOT IN ('draft', 'published', 'postponed', 'cancelled', 'archived');
