-- Helper to assign the current user as an administrator for a given event.

CREATE OR REPLACE FUNCTION public.assign_event_admin(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.event_administrators (event_id, user_id)
  VALUES (p_event_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_event_admin(uuid) TO authenticated;

