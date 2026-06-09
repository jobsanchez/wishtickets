-- Base venue schema (venues, sections, seats) required by get_event_availability and other migrations.
-- Run before 00014+; safe if tables already exist.

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text
);

CREATE TABLE IF NOT EXISTS public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_sections_venue ON public.sections(venue_id);

CREATE TABLE IF NOT EXISTS public.seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seats_venue ON public.seats(venue_id);
CREATE INDEX IF NOT EXISTS idx_seats_section ON public.seats(section_id);

-- Enable RLS (policies added in 00015)
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seats ENABLE ROW LEVEL SECURITY;
