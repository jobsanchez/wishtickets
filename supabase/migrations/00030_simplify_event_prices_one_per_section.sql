-- Simplify event_prices: one price per section, remove seat_type

-- Step 1: Create temp table with one row per (event_id, section_id)
-- Prefer seat_type='' (All), then 'standard', then others
CREATE TEMP TABLE event_prices_consolidated AS
SELECT DISTINCT ON (event_id, section_id)
  id,
  event_id,
  section_id,
  price_cents
FROM (
  SELECT id, event_id, section_id, price_cents,
    CASE
      WHEN seat_type = '' THEN 1
      WHEN seat_type = 'standard' THEN 2
      ELSE 3
    END AS r
  FROM public.event_prices
) sub
ORDER BY event_id, section_id, r;

-- Step 2: Drop unique constraint (the one on event_id, section_id, seat_type - not the primary key)
ALTER TABLE public.event_prices DROP CONSTRAINT IF EXISTS event_prices_event_id_section_id_seat_type_key;

-- Step 3: Delete all rows
DELETE FROM public.event_prices;

-- Step 4: Drop seat_type column
ALTER TABLE public.event_prices DROP COLUMN IF EXISTS seat_type;

-- Step 5: Add new unique constraint
ALTER TABLE public.event_prices ADD CONSTRAINT event_prices_event_section_unique UNIQUE (event_id, section_id);

-- Step 6: Re-insert consolidated rows
INSERT INTO public.event_prices (id, event_id, section_id, price_cents)
SELECT id, event_id, section_id, price_cents
FROM event_prices_consolidated;
