ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_username_length_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_username_length_check
CHECK (username IS NULL OR char_length(btrim(username)) BETWEEN 3 AND 30);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
ON public.profiles ((lower(username)))
WHERE username IS NOT NULL;
