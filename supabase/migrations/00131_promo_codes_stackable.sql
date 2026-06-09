-- Add stackable column to promo_codes: when true, code can be combined with early bird and other promos

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS stackable boolean NOT NULL DEFAULT false;

-- Drop existing function before changing return type (PostgreSQL does not allow altering return type)
DROP FUNCTION IF EXISTS public.get_promo_by_code(text);

-- Recreate get_promo_by_code with stackable in result
CREATE FUNCTION public.get_promo_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  event_id uuid,
  discount_type public.promo_discount_type,
  discount_value int,
  max_uses int,
  used_count int,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean,
  stackable boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT pc.id, pc.event_id, pc.discount_type, pc.discount_value, pc.max_uses, pc.used_count, pc.starts_at, pc.expires_at, pc.active, pc.stackable
  FROM public.promo_codes pc
  WHERE lower(trim(pc.code)) = lower(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_promo_by_code(text) TO authenticated;
