-- Async prebuilt ZIP files for print folder parts (`print-by-section/.../part-XX`).

CREATE TABLE IF NOT EXISTS public.print_folder_zip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE,
  folder_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  zip_object_path text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_print_folder_zip_jobs_folder_path
  ON public.print_folder_zip_jobs(folder_path);

CREATE INDEX IF NOT EXISTS idx_print_folder_zip_jobs_status_created
  ON public.print_folder_zip_jobs(status, created_at);

COMMENT ON TABLE public.print_folder_zip_jobs IS
  'Background ZIP preparation per print folder part; generation enqueues, cron worker builds ZIP to storage.';

ALTER TABLE public.print_folder_zip_jobs ENABLE ROW LEVEL SECURITY;

-- No direct client access required. Service role bypasses RLS.
CREATE POLICY "Deny all print_folder_zip_jobs to authenticated users"
  ON public.print_folder_zip_jobs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

