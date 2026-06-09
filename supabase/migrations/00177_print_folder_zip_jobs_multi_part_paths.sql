-- Support multi-part prebuilt ZIP artifacts per section.

ALTER TABLE public.print_folder_zip_jobs
  ADD COLUMN IF NOT EXISTS zip_object_paths text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.print_folder_zip_jobs.zip_object_paths IS
  'Uploaded ZIP object paths for this section job; one or many parts.';
