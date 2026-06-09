-- Add Google Maps URL to venues for admin-configured map pin links
ALTER TABLE public.venues
ADD COLUMN IF NOT EXISTS google_maps_url text;

COMMENT ON COLUMN public.venues.google_maps_url IS 'Google Maps share URL (e.g. https://maps.app.goo.gl/...)';
