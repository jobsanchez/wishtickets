-- Add standard_capacity to venues (default capacity for new sections when creating seats)
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS standard_capacity int NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.venues.standard_capacity IS 'Default capacity per section when creating new sections for this venue';
