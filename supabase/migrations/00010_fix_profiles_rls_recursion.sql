-- Fix RLS recursion: "Manage users can read all profiles" references profiles in its
-- USING clause, causing infinite recursion when evaluating the policy.
-- Remove the profiles-based admin check; rely on user_capabilities (manage_users) instead.
-- Users read own profile via auth.uid() = id; admins read all via manage_users capability.

DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.profiles;
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );
