-- Consolidated fix: ensure admins (with event access) can see and add event administrators.
-- Applies fixes from 00111 and 00113. Run in Supabase SQL Editor if db push fails.

-- 1. is_authorized_for_event: use role::text
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

-- 2. is_authorized_event_admin_manager: role::text + admins with event access
CREATE OR REPLACE FUNCTION public.is_authorized_event_admin_manager(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role::text = 'super_admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = auth.uid() AND p2.role::text = 'admin'
      )
      AND public.is_authorized_for_event(p_event_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_event_administrators'
      )
      AND EXISTS (
        SELECT 1 FROM public.event_administrators ea
        WHERE ea.event_id = p_event_id AND ea.user_id = auth.uid()
      )
    );
$$;

-- 3. Super admin RLS policy: use role::text
DROP POLICY IF EXISTS "Super admin can manage event_administrators" ON public.event_administrators;

CREATE POLICY "Super admin can manage event_administrators" ON public.event_administrators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'super_admin')
  );
