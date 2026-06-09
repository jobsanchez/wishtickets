-- Fix reservation_items_seat_id_fkey: seat_id can reference EITHER
-- public.seats (venue) OR public.event_seats (event-specific seating).
-- Drop the FK so event_seats IDs can be stored; rely on application logic for integrity.

ALTER TABLE public.reservation_items
DROP CONSTRAINT IF EXISTS reservation_items_seat_id_fkey;
