-- "To be announced" venue clears venue_id; column must allow NULL.

ALTER TABLE public.events
  ALTER COLUMN venue_id DROP NOT NULL;
