-- Backfill manage_seats, manage_prices, manage_events for admin users
-- so they can see Seats and Seat Pricing tabs on the Edit Event page.

INSERT INTO public.user_capabilities (user_id, capability)
SELECT p.id, cap
FROM public.profiles p
CROSS JOIN (VALUES ('manage_seats'), ('manage_prices'), ('manage_events')) AS t(cap)
WHERE p.role::text = 'admin'
ON CONFLICT (user_id, capability) DO NOTHING;
