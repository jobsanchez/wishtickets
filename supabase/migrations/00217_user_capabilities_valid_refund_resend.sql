-- Allow new dashboard capabilities in user_capabilities (CHECK was still 9 values; 00216 only updated the RPC).
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
  'manage_ticket_templates',
  'refund_lookup',
  'resend_tickets'
));
