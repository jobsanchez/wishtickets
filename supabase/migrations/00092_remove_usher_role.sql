-- Remove usher role: migrate existing usher users to admissions_staff, then recreate enum without usher.
-- PostgreSQL does not support removing enum values directly.
-- Must drop policies that depend on profiles.role before altering column type.

-- 1. Migrate usher users to admissions_staff
UPDATE public.profiles
SET role = 'admissions_staff'
WHERE role = 'usher';

-- 2. Drop policies that depend on profiles.role (cannot alter column while policies reference it)
DROP POLICY IF EXISTS "Staff can insert admin assignment bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can manage admin seat assignments" ON public.admin_seat_assignments;
DROP POLICY IF EXISTS "Staff can manage admin assignment items" ON public.admin_assignment_items;
DROP POLICY IF EXISTS "Admin and staff can read all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Staff can read and update tickets" ON public.tickets;
DROP POLICY IF EXISTS "Staff can read events" ON public.events;
DROP POLICY IF EXISTS "Admin can manage events" ON public.events;
DROP POLICY IF EXISTS "Admin can manage venues" ON public.venues;
DROP POLICY IF EXISTS "Admin can manage sections" ON public.sections;
DROP POLICY IF EXISTS "Admin can manage seats" ON public.seats;
DROP POLICY IF EXISTS "Admin can manage event_sections" ON public.event_sections;
DROP POLICY IF EXISTS "Admin can manage event_seats" ON public.event_seats;
DROP POLICY IF EXISTS "Admin can manage event_prices" ON public.event_prices;
DROP POLICY IF EXISTS "Admin can manage promo_codes" ON public.promo_codes;
DROP POLICY IF EXISTS "Admin can manage early_bird_prices" ON public.early_bird_prices;
DROP POLICY IF EXISTS "Admin can manage event_admissions_codes" ON public.event_admissions_codes;
DROP POLICY IF EXISTS "Admin can manage event_seat_layout" ON public.event_seat_layout;
DROP POLICY IF EXISTS "Admin can read all payments" ON public.payments;
DROP POLICY IF EXISTS "Settings managers can manage app_config" ON public.app_config;
DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.profiles;

-- 3. Create new enum without usher
CREATE TYPE public.app_role_new AS ENUM ('user', 'admin', 'admissions_staff', 'super_admin');

-- 4. Drop default on role (cannot cast automatically to new type)
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

-- 5. Alter profiles.role to use new type (usher already migrated, so no usher values remain)
ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.app_role_new
  USING (
    CASE
      WHEN role::text = 'usher' THEN 'admissions_staff'::public.app_role_new
      ELSE role::text::public.app_role_new
    END
  );

-- 6. Drop old enum and rename new
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- 7. Restore default for new rows
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user'::app_role;

-- 8. Recreate dropped policies (without usher in role lists)
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users')
  );

CREATE POLICY "Admin can manage venues" ON public.venues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admin can manage sections" ON public.sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admin can manage seats" ON public.seats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admin can manage events" ON public.events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Staff can read events" ON public.events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
  );

CREATE POLICY "Admin and staff can read all bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
  );

CREATE POLICY "Staff can insert admin assignment bookings" ON public.bookings
  FOR INSERT WITH CHECK (
    user_id IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
      OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
    )
  );

CREATE POLICY "Staff can manage admin seat assignments" ON public.admin_seat_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
  );

CREATE POLICY "Staff can manage admin assignment items" ON public.admin_assignment_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
  );

CREATE POLICY "Staff can read and update tickets" ON public.tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
  );

CREATE POLICY "Admin can read all payments" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admin can manage event_sections" ON public.event_sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_seats'))
  );

CREATE POLICY "Admin can manage event_seats" ON public.event_seats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_seats'))
  );

CREATE POLICY "Admin can manage event_prices" ON public.event_prices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

CREATE POLICY "Admin can manage promo_codes" ON public.promo_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

CREATE POLICY "Admin can manage early_bird_prices" ON public.early_bird_prices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

CREATE POLICY "Admin can manage event_admissions_codes" ON public.event_admissions_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events'))
  );

CREATE POLICY "Admin can manage event_seat_layout" ON public.event_seat_layout
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_seats'))
  );

CREATE POLICY "Settings managers can manage app_config" ON public.app_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_settings')
  );

-- 9. Update set_user_role RPC: remove usher from valid roles and admin assignable roles
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_new_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role text;
  v_target_role text;
  v_valid_roles text[] := ARRAY['user', 'admin', 'admissions_staff', 'super_admin'];
BEGIN
  IF p_new_role IS NULL OR p_new_role = '' OR NOT (p_new_role = ANY(v_valid_roles)) THEN
    RETURN false;
  END IF;

  v_actor_role := COALESCE(public.get_my_role(), '');
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  v_target_role := COALESCE(v_target_role, 'user');

  -- Super Admin: can assign any role
  IF v_actor_role = 'super_admin' THEN
    UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Admin: can only set user -> admissions_staff
  IF v_actor_role = 'admin' THEN
    IF v_target_role <> 'user' THEN
      RETURN false;  -- Can only change users, not admin/admissions_staff/super_admin
    END IF;
    IF p_new_role <> 'admissions_staff' THEN
      RETURN false;  -- Cannot set to admin or super_admin
    END IF;
    UPDATE public.profiles SET role = p_new_role WHERE id = p_user_id;
    RETURN true;
  END IF;

  -- Admissions Staff, User: cannot set any role
  RETURN false;
END;
$$;
