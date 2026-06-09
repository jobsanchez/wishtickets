-- Fix tickets_seat_id_fkey: tickets.seat_id can reference EITHER
-- public.seats (venue) OR public.event_seats (event-specific).
-- Postgres FK cannot point to two tables, so drop the FK and rely on
-- application/trigger for integrity. seat_id remains nullable for
-- section-only tickets (free/standing).

ALTER TABLE public.tickets
DROP CONSTRAINT IF EXISTS tickets_seat_id_fkey;
