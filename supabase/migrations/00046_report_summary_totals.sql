-- Summary metrics for Sales & Reports (all confirmed bookings, no limit)
-- Fixes: metrics were computed from limited report rows, undercounting when many bookings

CREATE OR REPLACE FUNCTION public.get_admin_report_summary()
RETURNS TABLE (
  confirmed_count bigint,
  revenue_cents bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    count(*)::bigint AS confirmed_count,
    coalesce(sum(b.total_cents), 0)::bigint AS revenue_cents
  FROM public.bookings b
  WHERE b.status = 'confirmed'
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff', 'usher'))
      OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'view_sales_analytics')
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_report_summary() TO authenticated;
