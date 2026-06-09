-- Async print job queue removed; table was only used by the former background worker.
DROP TABLE IF EXISTS public.print_generate_jobs;
