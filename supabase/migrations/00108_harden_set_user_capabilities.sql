-- Harden set_user_capabilities RPC with explicit whitelist.
-- Ensures no valid capability is dropped by mis-serialization or unexpected input format.
-- Fixes Seats and Prices not persisting when Super Admin saves capabilities.

CREATE OR REPLACE FUNCTION public.set_user_capabilities(
  p_user_id uuid,
  p_capabilities text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  valid_caps text[] := ARRAY[
    'manage_seats',
    'manage_events',
    'manage_venues',
    'manage_prices',
    'view_sales_analytics',
    'manage_assignments',
    'manage_event_administrators',
    'manage_event_admissions_codes',
    'manage_ticket_templates'
  ];
  cap text;
  filtered text[] := '{}';
BEGIN
  IF COALESCE(public.get_my_role(), '') <> 'super_admin' THEN
    RETURN false;
  END IF;

  DELETE FROM public.user_capabilities WHERE user_id = p_user_id;

  IF p_capabilities IS NOT NULL AND array_length(p_capabilities, 1) > 0 THEN
    FOREACH cap IN ARRAY p_capabilities
    LOOP
      IF cap IS NOT NULL AND trim(cap) <> '' AND cap = ANY(valid_caps) THEN
        filtered := array_append(filtered, cap);
      END IF;
    END LOOP;

    IF array_length(filtered, 1) > 0 THEN
      INSERT INTO public.user_capabilities (user_id, capability)
      SELECT p_user_id, unnest(filtered)
      ON CONFLICT (user_id, capability) DO NOTHING;
    END IF;
  END IF;

  RETURN true;
END;
$$;
