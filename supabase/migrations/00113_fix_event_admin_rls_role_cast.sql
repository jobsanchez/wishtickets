-- Fix: use role::text for app_role comparisons in is_authorized_for_event and RLS policy.
-- Resolves 403 when admins or super admins add event administrators.

-- 1. Update is_authorized_for_event
CREATE OR REPLACE FUNCTION public.is_authorized_for_event(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role::text = 'super_admin'
  )
  OR (
    (EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role::text = 'admin')
     OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events'))
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id AND ea.user_id = auth.uid()
    )
  );
$$;

-- 2. Update Super admin RLS policy on event_administrators
DROP POLICY IF EXISTS "Super admin can manage event_administrators" ON public.event_administrators;

CREATE POLICY "Super admin can manage event_administrators" ON public.event_administrators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'super_admin')
  );
