-- Dynamic promo rules (JSON) and optional display name for the Promo Designer.
-- When rule is null, existing discount_type + discount_value apply to subtotal (legacy).

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS rule jsonb;

COMMENT ON COLUMN public.promo_codes.rule IS 'Structured promo config (Zod in app). Null = use discount_type + discount_value on cart subtotal.';

DROP FUNCTION IF EXISTS public.get_promo_by_code(text);

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
  stackable boolean,
  display_name text,
  rule jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    pc.id,
    pc.event_id,
    pc.discount_type,
    pc.discount_value,
    pc.max_uses,
    pc.used_count,
    pc.starts_at,
    pc.expires_at,
    pc.active,
    pc.stackable,
    pc.display_name,
    pc.rule
  FROM public.promo_codes pc
  WHERE lower(trim(pc.code)) = lower(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_promo_by_code(text) TO authenticated;
