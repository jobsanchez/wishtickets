-- Remove obsolete manage_users and manage_settings capabilities
-- and move access control for users and global settings to the super_admin role.

-- 1. Drop any existing manage_users/manage_settings rows from user_capabilities
DELETE FROM public.user_capabilities
WHERE capability IN ('manage_users', 'manage_settings');

-- 2. Optionally remove them from capabilities lookup table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'capabilities'
  ) THEN
    DELETE FROM public.capabilities
    WHERE name IN ('manage_users', 'manage_settings');
  END IF;
END;
$$;

-- 3. Update valid_capability CHECK constraint to exclude manage_users/manage_settings
ALTER TABLE public.user_capabilities
DROP CONSTRAINT IF EXISTS valid_capability;

ALTER TABLE public.user_capabilities
ADD CONSTRAINT valid_capability CHECK (capability IN (
  'manage_seats',
  'manage_events',
  'manage_venues',
  'manage_prices',
  'view_sales_analytics',
  'manage_assignments',
  'manage_event_administrators'
));

-- 4. Update RLS on user_capabilities to depend on super_admin role instead of manage_users
DROP POLICY IF EXISTS "Users can read own capabilities" ON public.user_capabilities;
CREATE POLICY "Users can read own capabilities" ON public.user_capabilities
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.get_my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "Manage users can write capabilities" ON public.user_capabilities;
CREATE POLICY "Manage users can write capabilities" ON public.user_capabilities
  FOR ALL USING (
    public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
  );

-- 5. Update RLS on profiles to use super_admin role for full read access
DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.profiles;
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.get_my_role() = 'super_admin'
  );

-- 6. Update RLS on app_config (Global Settings) to be super_admin-only
DROP POLICY IF EXISTS "Settings managers can manage app_config" ON public.app_config;
CREATE POLICY "Settings managers can manage app_config" ON public.app_config
  FOR ALL USING (
    public.get_my_role() = 'super_admin'
  );

-- 7. Update RLS on event_categories to be super_admin-only
DROP POLICY IF EXISTS "Settings managers can manage event_categories" ON public.event_categories;
CREATE POLICY "Settings managers can manage event_categories" ON public.event_categories
  FOR ALL USING (
    public.get_my_role() = 'super_admin'
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
  );

