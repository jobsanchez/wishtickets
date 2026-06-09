-- Recreate admin_assignment_items for section-based (free/standing) assignments
-- Seat-based assignments use event_seats.assignment_id; section-based use this table.

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

DROP INDEX IF EXISTS idx_admin_assignment_items_assignment;
DROP INDEX IF EXISTS idx_admin_assignment_items_section;
CREATE INDEX idx_admin_assignment_items_assignment ON public.admin_assignment_items(assignment_id);
CREATE INDEX idx_admin_assignment_items_section ON public.admin_assignment_items(section_id) WHERE section_id IS NOT NULL;

ALTER TABLE public.admin_assignment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage admin assignment items" ON public.admin_assignment_items;
CREATE POLICY "Staff can manage admin assignment items"
  ON public.admin_assignment_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments'))
  );
