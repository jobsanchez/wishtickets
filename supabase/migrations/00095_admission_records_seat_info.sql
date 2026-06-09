-- Add section, row, seat to admission_records for list display
ALTER TABLE public.admission_records
  ADD COLUMN IF NOT EXISTS section_label text,
  ADD COLUMN IF NOT EXISTS row_label text,
  ADD COLUMN IF NOT EXISTS seat_number text;
