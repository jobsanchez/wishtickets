-- Remove `with_companion` from allowed values: migrate old rows, then narrow CHECK.
UPDATE public.bookings
SET
  special_request_type = 'others',
  special_request_details = COALESCE(
    NULLIF(TRIM(COALESCE(special_request_details, '')), ''),
    'Companion / assistant — migrated from previous “With companion” option'
  )
WHERE special_request_type = 'with_companion';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_special_request_type_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_special_request_type_check CHECK (
    special_request_type = ANY (ARRAY[
      'none',
      'pwd',
      'senior_citizen',
      'pregnant',
      'others'
    ]::text[])
  );
