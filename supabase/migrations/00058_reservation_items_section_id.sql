-- Add section_id to reservation_items if missing.
-- Used by get_event_availability and by reservation API when inserting items.
-- Nullable: can reference event_sections.id or sections.id (venue).
ALTER TABLE public.reservation_items
  ADD COLUMN IF NOT EXISTS section_id uuid;

COMMENT ON COLUMN public.reservation_items.section_id IS 'Event section or venue section for free/standing quantity or seat grouping.';
