-- Add pagination to get_upcoming_events for efficient loading of large event lists
CREATE OR REPLACE FUNCTION public.get_upcoming_events(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 18,
  p_offset int DEFAULT 0
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
  ORDER BY featured DESC NULLS LAST, event_start ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 18), 100))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

-- Count of matching events for pagination UI (e.g. "Showing 18 of 120")
CREATE OR REPLACE FUNCTION public.get_upcoming_events_count(
  p_category text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT count(*)::bigint
  FROM public.events
  WHERE status = 'published'
    AND event_start >= now()
    AND (p_category IS NULL OR p_category = 'all' OR category = p_category)
    AND (p_search IS NULL OR p_search = '' OR title ILIKE '%' || p_search || '%');
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_events(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_events(text, text, int, int) TO anon;
GRANT EXECUTE ON FUNCTION public.get_upcoming_events_count(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_events_count(text, text) TO anon;
