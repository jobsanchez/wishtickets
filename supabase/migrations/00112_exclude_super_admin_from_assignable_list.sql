-- Exclude super_admins from assignable event administrators list.
-- Super admins already have full access to all events; no need to assign them.

CREATE OR REPLACE FUNCTION public.get_assignable_event_admins(p_event_id uuid)
RETURNS TABLE (id uuid, email text, full_name text, role text, capabilities text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_authorized_event_admin_manager(p_event_id) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT p.id, p.email::text, p.full_name, p.role::text,
    COALESCE(
      (SELECT array_agg(uc.capability) FROM public.user_capabilities uc WHERE uc.user_id = p.id),
      '{}'::text[]
    )
  FROM public.profiles p
  WHERE (p.role::text = 'admin' OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc2 WHERE uc2.user_id = p.id AND uc2.capability = 'manage_events'
  ))
  AND p.role::text <> 'super_admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.event_administrators ea
    WHERE ea.event_id = p_event_id AND ea.user_id = p.id
  );
END;
$$;
