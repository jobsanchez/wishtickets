-- Email for staff assignee; label column already exists for "Assigned to" name.
ALTER TABLE public.event_admissions_codes
  ADD COLUMN IF NOT EXISTS assignee_email text;

COMMENT ON COLUMN public.event_admissions_codes.label IS 'Display name of the person assigned to use this admissions code.';
COMMENT ON COLUMN public.event_admissions_codes.assignee_email IS 'Email address for notifying the assignee.';
