-- RPC to return users assignable as event administrators for a given event.
-- Callable by super_admin or event admin managers (manage_event_administrators + already admin on event).
-- Returns users with admin/super_admin role OR manage_events capability, excluding those already assigned.

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
  WHERE (p.role::text IN ('admin', 'super_admin') OR EXISTS (
    SELECT 1 FROM public.user_capabilities uc2 WHERE uc2.user_id = p.id AND uc2.capability = 'manage_events'
  ))
  AND NOT EXISTS (
    SELECT 1 FROM public.event_administrators ea
    WHERE ea.event_id = p_event_id AND ea.user_id = p.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assignable_event_admins(uuid) TO authenticated;
