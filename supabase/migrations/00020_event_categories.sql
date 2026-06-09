-- Seed event_categories in app_config (editable via Settings)
INSERT INTO public.app_config (key, value) VALUES
  (
    'event_categories',
    '[
      {"value":"shows_concerts","label":"Shows & Concerts"},
      {"value":"sports","label":"Sports"},
      {"value":"tours_attraction","label":"Tours & Attraction"},
      {"value":"corporate_events","label":"Corporate Events"},
      {"value":"family","label":"Family"}
    ]'::jsonb
  )
ON CONFLICT (key) DO NOTHING;

-- RPC for public read of event categories (homepage, event form)
CREATE OR REPLACE FUNCTION public.get_event_categories()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value FROM public.app_config WHERE key = 'event_categories'),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_event_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_categories() TO anon;
