-- Allow print ticket generation jobs to end in "cancelled" (user stopped; keep completed work)

ALTER TABLE public.print_generate_jobs
  DROP CONSTRAINT IF EXISTS print_generate_jobs_status_check;

ALTER TABLE public.print_generate_jobs
  ADD CONSTRAINT print_generate_jobs_status_check
  CHECK (
    status IN ('pending', 'running', 'completed', 'failed', 'cancelled')
  );
