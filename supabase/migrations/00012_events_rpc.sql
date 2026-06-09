-- RPC to fetch published upcoming events without RLS. Bypasses any policy issues.
CREATE OR REPLACE FUNCTION public.get_upcoming_events(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS SETOF public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.events
  WHERE status = 'published'
    AND event_start >= now()
    AND (p_category IS NULL OR p_category = 'all' OR category = p_category)
    AND (p_search IS NULL OR p_search = '' OR title ILIKE '%' || p_search || '%')
  ORDER BY event_start ASC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_events(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_events(text, text) TO anon;
