-- Remove obsolete scan_tickets capability

-- 1. Drop any existing scan_tickets rows so the constraint can be changed safely
DELETE FROM public.user_capabilities
WHERE capability = 'scan_tickets';

-- 2. Update valid_capability CHECK to exclude scan_tickets
ALTER TABLE public.user_capabilities
DROP CONSTRAINT IF EXISTS valid_capability;

ALTER TABLE public.user_capabilities
ADD CONSTRAINT valid_capability CHECK (capability IN (
  'manage_seats',
  'manage_events',
  'manage_venues',
  'manage_prices',
  'manage_reservations',
  'manage_users',
  'view_sales_analytics',
  'manage_settings',
  'manage_assignments',
  'manage_event_administrators'
));

