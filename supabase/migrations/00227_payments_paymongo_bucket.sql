-- PayMongo checkout bucket persisted on payment row for reuse matching and analytics.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paymongo_bucket text;

COMMENT ON COLUMN public.payments.paymongo_bucket IS
  'Buyer-selected PayMongo rail bucket (qrph, ewallet, card, banks) when checkout session was created.';
