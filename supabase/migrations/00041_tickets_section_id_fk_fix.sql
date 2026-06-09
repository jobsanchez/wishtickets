-- Fix tickets_section_id_fkey: tickets.section_id can reference EITHER
-- public.event_sections (event-specific seating) OR public.sections (venue).
-- Postgres FK cannot point to two tables, so drop the FK and rely on
-- application logic for integrity.

ALTER TABLE public.tickets
DROP CONSTRAINT IF EXISTS tickets_section_id_fkey;
