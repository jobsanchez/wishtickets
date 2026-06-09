-- NULL status passes CHECK (status IN (...)) in Postgres; public book page treated that as non-bookable.
UPDATE public.events
SET status = 'draft'
WHERE status IS NULL;
