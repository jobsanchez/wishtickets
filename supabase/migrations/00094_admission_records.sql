-- Admission records: persisted list of admitted/re-entry tickets per admissions code
-- Each staff (admissions code) only sees their own punched tickets

CREATE TABLE IF NOT EXISTS public.admission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  qr_data text NOT NULL,
  admission_code text NOT NULL,
  action text NOT NULL CHECK (action IN ('admit', 're_entry_granted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admission_records_event_code ON public.admission_records(event_id, admission_code);
CREATE INDEX idx_admission_records_created ON public.admission_records(created_at DESC);

ALTER TABLE public.admission_records ENABLE ROW LEVEL SECURITY;

-- Only service role / admin client can insert (via API with session validation)
-- No direct user access; API validates session and filters by admission_code
CREATE POLICY "Service role only" ON public.admission_records
  FOR ALL USING (false);
