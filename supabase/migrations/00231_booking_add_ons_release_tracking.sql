-- Track admissions fulfillment of purchased add-ons.

ALTER TABLE public.booking_add_ons
  ADD COLUMN IF NOT EXISTS released_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by uuid;

UPDATE public.booking_add_ons
SET released_quantity = GREATEST(0, LEAST(quantity, COALESCE(released_quantity, 0)));

ALTER TABLE public.booking_add_ons
  DROP CONSTRAINT IF EXISTS booking_add_ons_released_quantity_chk;

ALTER TABLE public.booking_add_ons
  ADD CONSTRAINT booking_add_ons_released_quantity_chk CHECK (
    released_quantity >= 0 AND released_quantity <= quantity
  );

UPDATE public.booking_add_ons
SET released_at = CASE
  WHEN released_quantity >= quantity THEN COALESCE(released_at, now())
  ELSE NULL
END;
