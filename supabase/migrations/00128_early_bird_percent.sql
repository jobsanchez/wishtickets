-- Early bird: store discount as percentage instead of absolute price
-- price_cents -> discount_percent (0-100): early_bird_price = base * (100 - discount_percent) / 100

-- 1. Add discount_percent column
ALTER TABLE public.early_bird_prices
  ADD COLUMN IF NOT EXISTS discount_percent int NOT NULL DEFAULT 0;

-- 2. Backfill from existing price_cents using event_prices for base
UPDATE public.early_bird_prices eb
SET discount_percent = LEAST(100, GREATEST(0,
  COALESCE(
    ROUND(100 * (1 - eb.price_cents::numeric / NULLIF(ep.price_cents, 0)))::int,
    0
  )
))
FROM public.event_prices ep
WHERE ep.event_id = eb.event_id AND ep.section_id = eb.section_id;

-- 3. Add check constraint for valid range
ALTER TABLE public.early_bird_prices
  ADD CONSTRAINT early_bird_prices_discount_percent_range
  CHECK (discount_percent >= 0 AND discount_percent <= 100);

-- 4. Drop price_cents column
ALTER TABLE public.early_bird_prices DROP COLUMN IF EXISTS price_cents;
