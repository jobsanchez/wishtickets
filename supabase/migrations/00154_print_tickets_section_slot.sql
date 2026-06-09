-- Multiple print tickets per free/standing section (one row per slot).
-- Replaces single-row-per-section constraint when event_seat_id IS NULL.

ALTER TABLE public.print_tickets
ADD COLUMN IF NOT EXISTS section_slot_index integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.print_tickets.section_slot_index IS
  'For section-level print tickets (event_seat_id NULL): 1-based slot within section. 0 for seat-linked rows.';

DROP INDEX IF EXISTS public.idx_print_tickets_section_only;

CREATE UNIQUE INDEX idx_print_tickets_section_slot
  ON public.print_tickets(event_section_id, section_slot_index)
  WHERE event_seat_id IS NULL;

-- Legacy single free/standing row per section had implicit slot 1
UPDATE public.print_tickets
SET section_slot_index = 1
WHERE event_seat_id IS NULL AND section_slot_index = 0;
