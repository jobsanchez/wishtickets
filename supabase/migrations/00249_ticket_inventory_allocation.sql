-- Ticket inventory allocation: print_tickets as source of truth, tickets reference inventory on sale.

ALTER TABLE public.print_tickets
  ADD COLUMN IF NOT EXISTS allocated_ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocated_at timestamptz;

COMMENT ON COLUMN public.print_tickets.allocated_ticket_id IS
  'When set, this inventory row was allocated to a sold tickets row.';
COMMENT ON COLUMN public.print_tickets.allocated_at IS
  'When the inventory row was allocated to a buyer ticket.';

CREATE INDEX IF NOT EXISTS idx_print_tickets_unallocated_seat
  ON public.print_tickets(event_id, event_seat_id)
  WHERE event_seat_id IS NOT NULL AND allocated_ticket_id IS NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS print_ticket_id uuid REFERENCES public.print_tickets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tickets.print_ticket_id IS
  'Inventory row (print_tickets) this sale was allocated from, when using Seat Configurator ticket pool.';

CREATE INDEX IF NOT EXISTS idx_tickets_print_ticket_id
  ON public.tickets(print_ticket_id)
  WHERE print_ticket_id IS NOT NULL;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS require_ticket_inventory boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.require_ticket_inventory IS
  'When true, checkout and manual confirm require unallocated print_tickets inventory per seat before sale.';
