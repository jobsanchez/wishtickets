-- When set, section ZIP jobs only include ticket image paths for this booking + section
-- (avoids zipping entire historical storage under folder_prefix).

ALTER TABLE public.print_folder_zip_jobs
  ADD COLUMN IF NOT EXISTS source_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.print_folder_zip_jobs.source_booking_id IS
  'If set, file list is built from tickets for this booking and event_section_id only; otherwise all images under folder_prefix (section pool) are included.';
