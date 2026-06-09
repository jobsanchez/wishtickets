-- Rollback helper for the removed legacy async print generation queue table.
-- Apply only if you need to temporarily restore old data shape/integration.

CREATE TABLE IF NOT EXISTS public.print_generate_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  total_count int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_generate_jobs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_print_generate_jobs_event
  ON public.print_generate_jobs(event_id);
CREATE INDEX IF NOT EXISTS idx_print_generate_jobs_status
  ON public.print_generate_jobs(status);

ALTER TABLE public.print_generate_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage print_generate_jobs" ON public.print_generate_jobs;
CREATE POLICY "Staff can manage print_generate_jobs"
  ON public.print_generate_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin', 'admissions_staff')
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid()
        AND uc.capability IN ('manage_seats', 'manage_assignments')
    )
  );
