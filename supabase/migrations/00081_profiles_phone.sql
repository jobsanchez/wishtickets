-- Add phone to profiles for PayMongo billing prefill
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text;
