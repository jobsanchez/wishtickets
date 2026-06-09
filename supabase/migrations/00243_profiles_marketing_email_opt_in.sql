ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS marketing_email_opt_in boolean NOT NULL DEFAULT true;
