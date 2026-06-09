-- Ensure slug lookups are deterministic and prefer active records.
-- Previous implementation used `LIMIT 1` with no ordering, which could return an old duplicate
-- event row (e.g. archived/incomplete copy) and cause booking pages to show empty availability
-- even when the intended event has fully configured sections.

CREATE OR REPLACE FUNCTION public.get_event_by_slug(p_slug text)
RETURNS public.events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT e.*
  FROM public.events e
  WHERE lower(trim(e.slug)) = lower(trim(p_slug))
  ORDER BY
    CASE e.status
      WHEN 'published' THEN 0
      WHEN 'draft' THEN 1
      WHEN 'postponed' THEN 2
      WHEN 'cancelled' THEN 3
      WHEN 'archived' THEN 4
      ELSE 5
    END,
    e.updated_at DESC,
    e.created_at DESC,
    e.id DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_by_slug(text) TO anon;
