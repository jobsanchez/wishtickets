-- Shared report links: null expires_at means no time limit (valid until revoked).

ALTER TABLE public.shared_report_links
  ALTER COLUMN expires_at DROP NOT NULL;

COMMENT ON COLUMN public.shared_report_links.expires_at IS 'When set, link becomes invalid after this time. NULL = no expiry.';

UPDATE public.shared_report_links
SET expires_at = NULL
WHERE revoked_at IS NULL;

DROP POLICY IF EXISTS "Public can read valid shared_report_links" ON public.shared_report_links;
CREATE POLICY "Public can read valid shared_report_links"
  ON public.shared_report_links
  FOR SELECT
  TO anon, authenticated
  USING (
    revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );
