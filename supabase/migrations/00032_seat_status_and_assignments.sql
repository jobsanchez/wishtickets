-- Seat Status and Assignment System
-- 1. seating_type on event_sections
-- 2. recipient_name on tickets
-- 3. admin_seat_assignments + admin_assignment_items
-- 4. nullable user_id on bookings + RLS for admin assignments
-- 5. manage_assignments capability

-- 1. Section seating type
ALTER TABLE public.event_sections
ADD COLUMN IF NOT EXISTS seating_type text NOT NULL DEFAULT 'assigned'
CHECK (seating_type IN ('assigned', 'free', 'standing'));

COMMENT ON COLUMN public.event_sections.seating_type IS 'assigned = individual seats; free = FCFS quantity; standing = capacity only';

-- 2. Recipient name on tickets (for admin-assigned seats display)
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS recipient_name text;

-- 3. Admin seat assignments
CREATE TABLE IF NOT EXISTS public.admin_seat_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'confirmed')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_seat_assignments_event ON public.admin_seat_assignments(event_id);
CREATE INDEX idx_admin_seat_assignments_status ON public.admin_seat_assignments(status);

CREATE TABLE IF NOT EXISTS public.admin_assignment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.admin_seat_assignments(id) ON DELETE CASCADE,
  seat_id uuid REFERENCES public.event_seats(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.event_sections(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 1,
  CONSTRAINT assignment_item_check CHECK (
    (seat_id IS NOT NULL AND section_id IS NULL) OR
    (seat_id IS NULL AND section_id IS NOT NULL AND quantity > 0)
  )
);

CREATE INDEX idx_admin_assignment_items_assignment ON public.admin_assignment_items(assignment_id);
CREATE INDEX idx_admin_assignment_items_seat ON public.admin_assignment_items(seat_id) WHERE seat_id IS NOT NULL;
CREATE INDEX idx_admin_assignment_items_section ON public.admin_assignment_items(section_id) WHERE section_id IS NOT NULL;

-- RLS for admin tables
ALTER TABLE public.admin_seat_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assignment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage admin seat assignments"
  ON public.admin_seat_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
  );

CREATE POLICY "Staff can manage admin assignment items"
  ON public.admin_assignment_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
  );

-- 4. Allow nullable user_id on bookings for admin assignments
ALTER TABLE public.bookings
ALTER COLUMN user_id DROP NOT NULL;

-- Staff can insert bookings with user_id null (admin assignments)
CREATE POLICY "Staff can insert admin assignment bookings"
  ON public.bookings
  FOR INSERT WITH CHECK (
    user_id IS NULL
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
      OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
    )
  );

-- 5. Add manage_assignments capability
ALTER TABLE public.user_capabilities
DROP CONSTRAINT IF EXISTS valid_capability;

ALTER TABLE public.user_capabilities
ADD CONSTRAINT valid_capability CHECK (capability IN (
  'manage_seats', 'manage_events', 'manage_venues', 'manage_prices',
  'manage_reservations', 'manage_users', 'view_sales_analytics',
  'scan_tickets', 'manage_settings', 'manage_assignments'
));
