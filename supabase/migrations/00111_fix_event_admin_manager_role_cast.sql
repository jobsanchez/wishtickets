-- Fix: use role::text for app_role comparisons (matches 00107, 00109 pattern).
-- Also expand to allow admins with event access to manage event administrators.

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
        AND p.role::text = 'super_admin'
    )
    OR (
      -- Admins with event access can manage
      EXISTS (
        SELECT 1
        FROM public.profiles p2
        WHERE p2.id = auth.uid()
          AND p2.role::text = 'admin'
      )
      AND public.is_authorized_for_event(p_event_id)
    )
    OR (
      -- Users with manage_event_administrators capability who are event admins
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
