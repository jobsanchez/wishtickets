-- Fix infinite recursion: "Manage users can read all profiles" must NOT reference profiles
-- in its USING clause. Use user_capabilities (manage_users) for admin access instead.
-- See 00010_fix_profiles_rls_recursion.sql for original fix; 00092 inadvertently reverted it.

DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.profiles;
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );
