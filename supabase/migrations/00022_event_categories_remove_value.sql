-- Migrate events.category from slug (value) to label
UPDATE public.events e
SET category = ec.label
FROM public.event_categories ec
WHERE ec.value = e.category;

-- Migrate event_defaults.default_category from slug to label
UPDATE public.app_config ac
SET value = jsonb_set(ac.value, '{default_category}', to_jsonb(ec.label::text))
FROM public.event_categories ec
WHERE ac.key = 'event_defaults'
  AND ac.value->>'default_category' = ec.value;

-- Add UNIQUE on label before dropping value
ALTER TABLE public.event_categories
  ADD CONSTRAINT event_categories_label_key UNIQUE (label);

-- Drop value column
ALTER TABLE public.event_categories
  DROP COLUMN value;

-- Update RPC: return { value: label, label } for API compatibility
CREATE OR REPLACE FUNCTION public.get_event_categories()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object('value', label, 'label', label)
      ORDER BY sort_order, label
    )
     FROM public.event_categories),
    '[]'::jsonb
  );
$$;
