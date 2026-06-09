-- Allow event_sections.capacity to be 0 (empty section before seats are generated)
ALTER TABLE public.event_sections ALTER COLUMN capacity DROP DEFAULT;
ALTER TABLE public.event_sections ALTER COLUMN capacity SET DEFAULT 0;
