-- Re-entry flag for admitted tickets (person can leave and return once)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS re_entry_allowed boolean NOT NULL DEFAULT false;
