-- event_categories table (replaces app_config JSON storage)
CREATE TABLE IF NOT EXISTS public.event_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

-- Seed default categories (match existing events)
INSERT INTO public.event_categories (value, label, sort_order) VALUES
  ('shows_concerts', 'Shows & Concerts', 1),
  ('sports', 'Sports', 2),
  ('tours_attraction', 'Tours & Attraction', 3),
  ('corporate_events', 'Corporate Events', 4),
  ('family', 'Family', 5)
ON CONFLICT (value) DO NOTHING;

-- Remove old app_config entry
DELETE FROM public.app_config WHERE key = 'event_categories';

-- RLS: public read for homepage/event form
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read event_categories" ON public.event_categories
  FOR SELECT USING (true);

-- Only manage_settings can write
CREATE POLICY "Settings managers can manage event_categories" ON public.event_categories
  FOR ALL USING (public.current_user_has_capability('manage_settings'))
  WITH CHECK (public.current_user_has_capability('manage_settings'));

-- Update RPC to read from table
CREATE OR REPLACE FUNCTION public.get_event_categories()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('value', value, 'label', label) ORDER BY sort_order, value)
     FROM public.event_categories),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_event_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_categories() TO anon;
