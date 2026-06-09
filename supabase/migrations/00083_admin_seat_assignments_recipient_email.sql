-- Add recipient_email for manual distribution email sending

ALTER TABLE public.admin_seat_assignments
ADD COLUMN IF NOT EXISTS recipient_email text;
