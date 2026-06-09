-- Add granular capabilities for per-event Admissions Codes and Ticket Templates
-- Also backfill them for users who already have manage_events.

-- 1. Extend valid_capability CHECK on user_capabilities
ALTER TABLE public.user_capabilities
DROP CONSTRAINT IF EXISTS valid_capability;

ALTER TABLE public.user_capabilities
ADD CONSTRAINT valid_capability CHECK (capability IN (
  'manage_seats',
  'manage_events',
  'manage_venues',
  'manage_prices',
  'view_sales_analytics',
  'manage_assignments',
  'manage_event_administrators',
  'manage_event_admissions_codes',
  'manage_ticket_templates'
));

-- 2. Optionally add to capabilities lookup table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'capabilities'
  ) THEN
    INSERT INTO public.capabilities (name)
    VALUES
      ('manage_event_admissions_codes'),
      ('manage_ticket_templates')
    ON CONFLICT (name) DO NOTHING;
  END IF;
END;
$$;

-- 3. Backfill: grant new capabilities to users who already have manage_events
INSERT INTO public.user_capabilities (user_id, capability)
SELECT uc.user_id, 'manage_event_admissions_codes'
FROM public.user_capabilities uc
WHERE uc.capability = 'manage_events'
ON CONFLICT (user_id, capability) DO NOTHING;

INSERT INTO public.user_capabilities (user_id, capability)
SELECT uc.user_id, 'manage_ticket_templates'
FROM public.user_capabilities uc
WHERE uc.capability = 'manage_events'
ON CONFLICT (user_id, capability) DO NOTHING;

