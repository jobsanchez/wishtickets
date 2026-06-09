-- Toggle for notifying event admins/creator when a sale succeeds.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS sale_success_email_enabled boolean NOT NULL DEFAULT false;
