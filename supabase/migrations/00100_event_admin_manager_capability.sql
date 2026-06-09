-- Event admin manager capability: allow certain users to manage event_administrators
-- for events where they are already administrators.

CREATE OR REPLACE FUNCTION public.is_authorized_event_admin_manager(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    -- Super admin can always manage event administrators
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR (
      -- Users with manage_event_administrators capability who are also admins
      EXISTS (
        SELECT 1
        FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability = 'manage_event_administrators'
      )
      AND EXISTS (
        SELECT 1
        FROM public.event_administrators ea
        WHERE ea.event_id = p_event_id
          AND ea.user_id = auth.uid()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_event_admin_manager(uuid) TO authenticated;

-- RLS policy to allow event admin managers to manage event_administrators rows
DROP POLICY IF EXISTS "Event admin managers can manage event_administrators" ON public.event_administrators;

CREATE POLICY "Event admin managers can manage event_administrators"
ON public.event_administrators
FOR ALL
USING (public.is_authorized_event_admin_manager(event_id));

