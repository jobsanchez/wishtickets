-- Atomic reservation line replace: prevents duplicate rows when concurrent POST/PATCH interleave
-- separate DELETE + INSERT (each request deletes, then both insert — quantities stack for free sections).

CREATE OR REPLACE FUNCTION public.replace_reservation_cart_items(
  p_cart_id uuid,
  p_profile_id uuid,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.reservation_carts c
    WHERE c.id = p_cart_id
      AND c.profile_id = p_profile_id
      AND c.expires_at > now()
  )
  INTO v_ok;

  IF NOT COALESCE(v_ok, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cart_not_found_or_expired');
  END IF;

  DELETE FROM public.reservation_items WHERE cart_id = p_cart_id;

  INSERT INTO public.reservation_items (cart_id, seat_id, section_id, quantity, add_on_id)
  SELECT
    p_cart_id,
    CASE WHEN seat_raw IS NOT NULL THEN seat_raw ELSE NULL END,
    CASE WHEN seat_raw IS NULL AND add_raw IS NULL THEN section_raw ELSE NULL END,
    GREATEST(COALESCE(qty, 1), 1),
    CASE WHEN add_raw IS NOT NULL THEN add_raw ELSE NULL END
  FROM (
    SELECT
      NULLIF(trim(elem->>'seat_id'), '')::uuid AS seat_raw,
      NULLIF(trim(elem->>'section_id'), '')::uuid AS section_raw,
      NULLIF(trim(elem->>'add_on_id'), '')::uuid AS add_raw,
      COALESCE(NULLIF(trim(elem->>'quantity'), '')::int, 1) AS qty
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS elem
  ) parsed
  WHERE seat_raw IS NOT NULL OR section_raw IS NOT NULL OR add_raw IS NOT NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_reservation_cart_items(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_reservation_cart_items(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_reservation_cart_items(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.replace_reservation_cart_items(uuid, uuid, jsonb) IS
  'Replaces reservation_items for a cart in one transaction (DELETE then INSERT).';
