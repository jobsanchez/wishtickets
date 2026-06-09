-- Add buyer_phone for on-site/walk-in purchases when user_id is null
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS buyer_phone text;

COMMENT ON COLUMN public.bookings.buyer_phone IS 'Contact number for on-site purchases when user_id is null';
