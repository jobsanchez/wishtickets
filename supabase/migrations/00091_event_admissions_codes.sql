-- Admissions codes for event-specific ticket scanning (no login required)
-- Each event can have multiple codes; each code is tied to one event

-- Helper to generate 8 alphanumeric chars (0-9, A-Z)
CREATE OR REPLACE FUNCTION public.generate_admissions_code_8()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
  i int;
  r real;
BEGIN
  FOR i IN 1..8 LOOP
    r := random();
    result := result || substr(chars, 1 + floor(r * 36)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

CREATE TABLE IF NOT EXISTS public.event_admissions_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(code)
);

CREATE UNIQUE INDEX idx_event_admissions_codes_code ON public.event_admissions_codes(code);
CREATE INDEX idx_event_admissions_codes_event ON public.event_admissions_codes(event_id);

ALTER TABLE public.event_admissions_codes ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin can manage
CREATE POLICY "Admin can manage event_admissions_codes" ON public.event_admissions_codes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events'))
  );

-- RPC for validation: anon can call (no auth required for admissions flow)
CREATE OR REPLACE FUNCTION public.validate_admissions_code(p_code text)
RETURNS TABLE (
  event_id uuid,
  event_title text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT eac.event_id, e.title
  FROM public.event_admissions_codes eac
  JOIN public.events e ON e.id = eac.event_id
  WHERE upper(trim(eac.code)) = upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.validate_admissions_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_admissions_code(text) TO authenticated;
