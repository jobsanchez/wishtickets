-- Reconciliation migration:
-- `public.print_generate_jobs` was already dropped in 00161.
-- Keep this guard so environments that replay from different baselines converge safely.

DO $$
BEGIN
  IF to_regclass('public.print_generate_jobs') IS NOT NULL THEN
    DROP TABLE public.print_generate_jobs;
  END IF;
END
$$;
