-- Move print folder ZIP jobs to section-level artifacts (one ZIP per section prefix).

ALTER TABLE public.print_folder_zip_jobs
  ADD COLUMN IF NOT EXISTS event_section_id uuid REFERENCES public.event_sections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS section_slug text,
  ADD COLUMN IF NOT EXISTS folder_prefix text,
  ADD COLUMN IF NOT EXISTS requested_by uuid,
  ADD COLUMN IF NOT EXISTS zip_size_bytes bigint NOT NULL DEFAULT 0 CHECK (zip_size_bytes >= 0),
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

-- Backward-compat: old rows used folder_path for part folders; new rows use folder_prefix.
UPDATE public.print_folder_zip_jobs
SET folder_prefix = folder_path
WHERE coalesce(folder_prefix, '') = ''
  AND coalesce(folder_path, '') <> '';

-- Keep a single queue row per event section.
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_folder_zip_jobs_event_section
  ON public.print_folder_zip_jobs(event_id, event_section_id)
  WHERE event_id IS NOT NULL AND event_section_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_print_folder_zip_jobs_event_status
  ON public.print_folder_zip_jobs(event_id, status, created_at);

COMMENT ON COLUMN public.print_folder_zip_jobs.event_section_id IS
  'Target event section for this section-level ZIP job.';
COMMENT ON COLUMN public.print_folder_zip_jobs.folder_prefix IS
  'Storage prefix to zip, e.g. print-by-section/{eventSlug}/{sectionSlug}.';
COMMENT ON COLUMN public.print_folder_zip_jobs.zip_object_path IS
  'Storage object path of generated ZIP artifact.';
COMMENT ON COLUMN public.print_folder_zip_jobs.zip_size_bytes IS
  'Generated ZIP artifact size in bytes.';

CREATE OR REPLACE FUNCTION public.lock_next_print_folder_zip_job()
RETURNS SETOF public.print_folder_zip_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.print_folder_zip_jobs t
  SET
    status = 'processing',
    last_activity_at = now(),
    updated_at = now(),
    current_stage = 'processing'
  FROM (
    SELECT j.id
    FROM public.print_folder_zip_jobs j
    WHERE j.status = 'pending'
    ORDER BY j.updated_at ASC, j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE t.id = picked.id
  RETURNING t.*;
$$;

REVOKE ALL ON FUNCTION public.lock_next_print_folder_zip_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_next_print_folder_zip_job() TO service_role;
