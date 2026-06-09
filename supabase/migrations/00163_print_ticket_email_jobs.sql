-- Async queue for bulk "send selected print tickets" email (chunked worker + poll).

CREATE TABLE IF NOT EXISTS public.print_ticket_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_emails text[] NOT NULL,
  print_ticket_ids uuid[] NOT NULL,
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

CREATE INDEX idx_print_ticket_email_jobs_status_created
  ON public.print_ticket_email_jobs(status, created_at);

CREATE INDEX idx_print_ticket_email_jobs_created_by
  ON public.print_ticket_email_jobs(created_by);

COMMENT ON TABLE public.print_ticket_email_jobs IS
  'Queued bulk send of print ticket emails; worker advances cursor in chunks (see /api/cron/print-ticket-email-jobs).';

ALTER TABLE public.print_ticket_email_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can insert own print_ticket_email_jobs"
  ON public.print_ticket_email_jobs
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

CREATE POLICY "Staff can select own print_ticket_email_jobs"
  ON public.print_ticket_email_jobs
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

CREATE POLICY "Staff can cancel own pending print_ticket_email_jobs"
  ON public.print_ticket_email_jobs
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

-- Atomically lock the next job for the worker (service_role only).
CREATE OR REPLACE FUNCTION public.lock_next_print_ticket_email_job()
RETURNS SETOF public.print_ticket_email_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.print_ticket_email_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now()
  FROM (
    SELECT j.id
    FROM public.print_ticket_email_jobs j
    WHERE (
        j.status = 'pending'
        OR (
          j.status = 'processing'
          AND j.cursor < COALESCE(cardinality(j.print_ticket_ids), 0)
        )
      )
      AND j.status NOT IN ('completed', 'failed', 'cancelled')
    ORDER BY j.created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_next_print_ticket_email_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_next_print_ticket_email_job() TO service_role;
