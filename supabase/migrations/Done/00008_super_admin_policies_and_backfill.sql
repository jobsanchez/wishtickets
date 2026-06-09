-- Update RLS policies to include super_admin (same access as admin)

-- Profiles: Manage users can read all - add super_admin
DROP POLICY IF EXISTS "Manage users can read all profiles" ON public.profiles;
CREATE POLICY "Manage users can read all profiles" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_users'
    )
  );

-- Venues
DROP POLICY IF EXISTS "Admin can manage venues" ON public.venues;
CREATE POLICY "Admin can manage venues" ON public.venues
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- Sections
DROP POLICY IF EXISTS "Admin can manage sections" ON public.sections;
CREATE POLICY "Admin can manage sections" ON public.sections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- Seats
DROP POLICY IF EXISTS "Admin can manage seats" ON public.seats;
CREATE POLICY "Admin can manage seats" ON public.seats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- Events
DROP POLICY IF EXISTS "Admin can manage events" ON public.events;
CREATE POLICY "Admin can manage events" ON public.events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Staff can read events" ON public.events;
CREATE POLICY "Staff can read events" ON public.events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admissions_staff', 'usher', 'admin', 'super_admin'))
  );

-- Bookings
DROP POLICY IF EXISTS "Admin and staff can read all bookings" ON public.bookings;
CREATE POLICY "Admin and staff can read all bookings" ON public.bookings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
  );

-- Tickets
DROP POLICY IF EXISTS "Staff can read and update tickets" ON public.tickets;
CREATE POLICY "Staff can read and update tickets" ON public.tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
  );

-- Payments
DROP POLICY IF EXISTS "Admin can read all payments" ON public.payments;
CREATE POLICY "Admin can read all payments" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

-- App config (from 00006)
DROP POLICY IF EXISTS "Settings managers can manage app_config" ON public.app_config;
CREATE POLICY "Settings managers can manage app_config" ON public.app_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_settings'
    )
  );

-- Backfill super_admin users with all capabilities (like admin)
INSERT INTO public.user_capabilities (user_id, capability)
SELECT p.id, cap
FROM public.profiles p
CROSS JOIN (
  VALUES
    ('manage_seats'), ('manage_events'), ('manage_venues'), ('manage_prices'),
    ('manage_reservations'), ('manage_users'), ('view_sales_analytics'),
    ('scan_tickets'), ('manage_settings')
) AS t(cap)
WHERE p.role = 'super_admin'
ON CONFLICT (user_id, capability) DO NOTHING;
