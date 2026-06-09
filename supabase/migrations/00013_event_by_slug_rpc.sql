-- RPC to fetch single event by slug (for book page, view details). Bypasses RLS.
CREATE OR REPLACE FUNCTION public.get_event_by_slug(p_slug text)
RETURNS public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT *
  FROM public.events
  WHERE slug = p_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text) TO anon;
