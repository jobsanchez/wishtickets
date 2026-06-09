-- Used by confirm-booking (admin resend), checkout (on-site email), admissions offline pack, and scan buyer display.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS buyer_email_override text;

COMMENT ON COLUMN public.bookings.buyer_email_override IS
  'When set, ticket email delivery and buyer-facing display may use this address instead of the buyer profile email.';
