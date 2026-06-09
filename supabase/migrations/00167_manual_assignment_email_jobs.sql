-- Async chunked email for Manual Ticket Distribution (browser POST …/process + ZIP batches).

CREATE TABLE IF NOT EXISTS public.manual_assignment_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.admin_seat_assignments(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_ids uuid[] NOT NULL,
  cursor int NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  error_message text,
  chunks_completed int NOT NULL DEFAULT 0 CHECK (chunks_completed >= 0),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_manual_assignment_email_jobs_status_created
  ON public.manual_assignment_email_jobs(status, created_at);

CREATE INDEX idx_manual_assignment_email_jobs_created_by
  ON public.manual_assignment_email_jobs(created_by);

CREATE INDEX idx_manual_assignment_email_jobs_assignment
  ON public.manual_assignment_email_jobs(assignment_id);

COMMENT ON TABLE public.manual_assignment_email_jobs IS
  'Queued manual-distribution ticket emails; worker advances cursor in chunks (see assignments send-email/jobs).';

ALTER TABLE public.manual_assignment_email_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert own manual_assignment_email_jobs"
  ON public.manual_assignment_email_jobs
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1 FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_assignments')
      )
    )
  );

CREATE POLICY "Staff can select own manual_assignment_email_jobs"
  ON public.manual_assignment_email_jobs
  FOR SELECT
  USING (
    created_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1 FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_assignments')
      )
    )
  );

CREATE POLICY "Staff can cancel own pending manual_assignment_email_jobs"
  ON public.manual_assignment_email_jobs
  FOR UPDATE
  USING (
    created_by = auth.uid()
    AND status = 'pending'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1 FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_assignments')
      )
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'cancelled'
  );

CREATE OR REPLACE FUNCTION public.lock_manual_assignment_email_job_by_id_for_creator(
  p_job_id uuid,
  p_user_id uuid
)
RETURNS SETOF public.manual_assignment_email_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.manual_assignment_email_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now()
  FROM (
    SELECT j.id
    FROM public.manual_assignment_email_jobs j
    WHERE j.id = p_job_id
      AND j.created_by = p_user_id
      AND (
        j.status = 'pending'
        OR (
          j.status = 'processing'
          AND j.cursor < COALESCE(cardinality(j.ticket_ids), 0)
        )
      )
      AND j.status NOT IN ('completed', 'failed', 'cancelled')
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_manual_assignment_email_job_by_id_for_creator(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_manual_assignment_email_job_by_id_for_creator(uuid, uuid) TO service_role;
