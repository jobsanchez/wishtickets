-- Fix RLS recursion: user_capabilities policies reference user_capabilities in their
-- USING/WITH CHECK clauses, causing infinite recursion.
-- Use SECURITY DEFINER function to check capabilities without triggering RLS.

CREATE OR REPLACE FUNCTION public.current_user_has_capability(p_cap text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_capabilities
    WHERE user_id = auth.uid() AND capability = p_cap
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_capability(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_capability(text) TO anon;

-- Replace recursive policies with function-based checks
DROP POLICY IF EXISTS "Users can read own capabilities" ON public.user_capabilities;
CREATE POLICY "Users can read own capabilities" ON public.user_capabilities
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.current_user_has_capability('manage_users')
  );

DROP POLICY IF EXISTS "Manage users can write capabilities" ON public.user_capabilities;
CREATE POLICY "Manage users can write capabilities" ON public.user_capabilities
  FOR ALL
  USING (public.current_user_has_capability('manage_users'))
  WITH CHECK (public.current_user_has_capability('manage_users'));

-- RPC for super_admin to set user capabilities. Bypasses RLS; auth via role only.
CREATE OR REPLACE FUNCTION public.set_user_capabilities(
  p_user_id uuid,
  p_capabilities text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.get_my_role(), '') <> 'super_admin' THEN
    RETURN false;
  END IF;
  DELETE FROM public.user_capabilities WHERE user_id = p_user_id;
  IF array_length(p_capabilities, 1) > 0 THEN
    INSERT INTO public.user_capabilities (user_id, capability)
    SELECT p_user_id, unnest(p_capabilities)
    ON CONFLICT (user_id, capability) DO NOTHING;
  END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_capabilities(uuid, text[]) TO authenticated;
