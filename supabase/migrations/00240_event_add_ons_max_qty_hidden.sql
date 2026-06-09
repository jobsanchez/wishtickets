-- Per-cart purchase cap and admin visibility for event add-ons.

ALTER TABLE public.event_add_ons
  ADD COLUMN IF NOT EXISTS max_qty_per_cart integer NOT NULL DEFAULT 10
    CHECK (max_qty_per_cart >= 1 AND max_qty_per_cart <= 9999);

ALTER TABLE public.event_add_ons
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_add_ons.max_qty_per_cart IS
  'Maximum units of this add-on in one reservation cart (per checkout).';
COMMENT ON COLUMN public.event_add_ons.is_hidden IS
  'When true, omitted from public book API and buyer UI; staff still manage in admin.';
