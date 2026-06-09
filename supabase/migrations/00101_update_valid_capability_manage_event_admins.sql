-- Extend valid_capability check to include manage_event_administrators

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
  'scan_tickets',
  'manage_settings',
  'manage_assignments',
  'manage_event_administrators'
));

