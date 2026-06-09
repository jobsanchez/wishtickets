-- Live progress fields for print folder ZIP preparation.

ALTER TABLE public.print_folder_zip_jobs
  ADD COLUMN IF NOT EXISTS total_files int NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  ADD COLUMN IF NOT EXISTS processed_files int NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
  ADD COLUMN IF NOT EXISTS progress_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  ADD COLUMN IF NOT EXISTS current_stage text NOT NULL DEFAULT 'pending';

COMMENT ON COLUMN public.print_folder_zip_jobs.total_files IS
  'Total PNG files detected for this folder ZIP job.';
COMMENT ON COLUMN public.print_folder_zip_jobs.processed_files IS
  'PNG files already fetched/appended into ZIP buffer.';
COMMENT ON COLUMN public.print_folder_zip_jobs.progress_pct IS
  'Computed progress percentage from processed_files / total_files.';
COMMENT ON COLUMN public.print_folder_zip_jobs.current_stage IS
  'Current stage: pending, listing, zipping, uploading, completed, failed.';

