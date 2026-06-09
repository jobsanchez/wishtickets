-- Add theme preference to profiles for light/dark mode persistence
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_preference text DEFAULT 'dark'
CHECK (theme_preference IN ('light', 'dark'));
