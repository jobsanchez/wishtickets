-- Fix Seats and Prices tabs not showing: ensure valid_capability constraint
-- and backfill manage_seats, manage_prices, manage_events for admin users.
-- Use role::text to avoid app_role enum/text mismatch.

-- 1. Ensure valid_capability CHECK includes all 9 capabilities
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

-- 2. Backfill manage_seats, manage_prices, manage_events for admin users
-- Using role::text to avoid "column role is of type app_role but expression is of type text"
INSERT INTO public.user_capabilities (user_id, capability)
SELECT p.id, cap
FROM public.profiles p
CROSS JOIN (VALUES ('manage_seats'), ('manage_prices'), ('manage_events')) AS t(cap)
WHERE p.role::text = 'admin'
ON CONFLICT (user_id, capability) DO NOTHING;
