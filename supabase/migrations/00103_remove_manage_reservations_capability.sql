-- Remove obsolete manage_reservations capability

-- 1. Drop any existing manage_reservations rows from user_capabilities
DELETE FROM public.user_capabilities
WHERE capability = 'manage_reservations';

-- 2. Optionally remove it from capabilities lookup table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'capabilities'
  ) THEN
    DELETE FROM public.capabilities
    WHERE name = 'manage_reservations';
  END IF;
END;
$$;

-- 3. Update valid_capability CHECK constraint to exclude manage_reservations
ALTER TABLE public.user_capabilities
DROP CONSTRAINT IF EXISTS valid_capability;

ALTER TABLE public.user_capabilities
ADD CONSTRAINT valid_capability CHECK (capability IN (
  'manage_seats',
  'manage_events',
  'manage_venues',
  'manage_prices',
  'manage_users',
  'view_sales_analytics',
  'manage_settings',
  'manage_assignments',
  'manage_event_administrators'
));

