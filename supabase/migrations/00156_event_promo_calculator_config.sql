-- Persist event-level promo calculator worksheet data as JSON.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS promo_calculator_config jsonb;

COMMENT ON COLUMN public.events.promo_calculator_config IS
  'JSON config for event promo budget calculator: budget percent, giveaway rows, discount rows, and expense rows.';
