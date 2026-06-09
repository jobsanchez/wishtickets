-- Promo codes: percentage or fixed discount, optional event scope, usage limits

CREATE TYPE public.promo_discount_type AS ENUM ('percentage', 'fixed');

CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  discount_type public.promo_discount_type NOT NULL DEFAULT 'percentage',
  discount_value int NOT NULL CHECK (discount_value >= 0),
  max_uses int,
  used_count int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code)
);

CREATE UNIQUE INDEX idx_promo_codes_code_lower ON public.promo_codes (lower(code));
CREATE INDEX idx_promo_codes_event ON public.promo_codes(event_id);
CREATE INDEX idx_promo_codes_active ON public.promo_codes(active) WHERE active = true;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage promo_codes" ON public.promo_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

CREATE POLICY "Authenticated can read active promo_codes" ON public.promo_codes
  FOR SELECT USING (active = true);

-- Add promo columns to bookings
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS discount_cents int NOT NULL DEFAULT 0;

-- RPC for case-insensitive promo lookup (avoids wildcard issues with ilike)
CREATE OR REPLACE FUNCTION public.get_promo_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  discount_type public.promo_discount_type,
  discount_value int,
  max_uses int,
  used_count int,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pc.id, pc.event_id, pc.discount_type, pc.discount_value, pc.max_uses, pc.used_count, pc.starts_at, pc.expires_at, pc.active
  FROM public.promo_codes pc
  WHERE lower(trim(pc.code)) = lower(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_promo_by_code(text) TO authenticated;

-- Atomic increment for promo usage
CREATE OR REPLACE FUNCTION public.increment_promo_used_count(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.promo_codes SET used_count = used_count + 1 WHERE id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_promo_used_count(uuid) TO authenticated;
