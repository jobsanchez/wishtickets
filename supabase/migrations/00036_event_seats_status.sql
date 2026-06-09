-- Replace admin_assignment_items with event_seats.status and assignment_id
-- 1. Add columns to event_seats
-- 2. Migrate existing seat assignments from admin_assignment_items
-- 3. Drop admin_assignment_items

-- 1. Add columns
ALTER TABLE public.event_seats
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available'
CHECK (status IN ('available', 'reserved', 'sold'));

ALTER TABLE public.event_seats
ADD COLUMN IF NOT EXISTS assignment_id uuid
REFERENCES public.admin_seat_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_event_seats_assignment
ON public.event_seats(assignment_id) WHERE assignment_id IS NOT NULL;

-- 2. Migrate: seats in admin_assignment_items with reserved assignment -> status reserved
UPDATE public.event_seats es
SET status = 'reserved', assignment_id = ai.assignment_id
FROM public.admin_assignment_items ai
JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
WHERE es.id = ai.seat_id AND a.status = 'reserved';

-- 2b. Migrate: seats in admin_assignment_items with confirmed assignment -> status sold
UPDATE public.event_seats es
SET status = 'sold', assignment_id = NULL
FROM public.admin_assignment_items ai
JOIN public.admin_seat_assignments a ON a.id = ai.assignment_id
WHERE es.id = ai.seat_id AND a.status = 'confirmed';

-- 3. Drop admin_assignment_items
DROP TABLE IF EXISTS public.admin_assignment_items;
