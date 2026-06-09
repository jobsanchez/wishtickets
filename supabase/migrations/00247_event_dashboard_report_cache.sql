-- Snapshot cache for Sales & Reports dashboard (full JSON per event + date range).
-- Read/write via service role in API; invalidated on underlying sales/admission changes.

CREATE TABLE IF NOT EXISTS public.event_dashboard_report_cache (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  date_from date NOT NULL DEFAULT '1970-01-01',
  date_to date NOT NULL DEFAULT '1970-01-01',
  report jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_event_dashboard_report_cache_computed_at
  ON public.event_dashboard_report_cache (computed_at DESC);

COMMENT ON TABLE public.event_dashboard_report_cache IS
  'Cached dashboard JSON from buildDashboardMetricsReport; 1970-01-01 dates mean all-time filter.';

ALTER TABLE public.event_dashboard_report_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only event_dashboard_report_cache" ON public.event_dashboard_report_cache;
CREATE POLICY "Service role only event_dashboard_report_cache"
  ON public.event_dashboard_report_cache
  FOR ALL
  USING (false);

CREATE OR REPLACE FUNCTION public.invalidate_event_dashboard_cache(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.event_dashboard_report_cache
  WHERE event_id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_tickets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking_id uuid;
  v_event_id uuid;
BEGIN
  v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);
  IF v_booking_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT b.event_id INTO v_event_id
  FROM public.bookings b
  WHERE b.id = v_booking_id;
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_assignment_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id uuid;
  v_event_id uuid;
BEGIN
  v_assignment_id := COALESCE(NEW.assignment_id, OLD.assignment_id);
  IF v_assignment_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT a.event_id INTO v_event_id
  FROM public.admin_seat_assignments a
  WHERE a.id = v_assignment_id;
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_admission_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_event_scoped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);
  PERFORM public.invalidate_event_dashboard_cache(v_event_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_invalidate_dashboard_cache_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.invalidate_event_dashboard_cache(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_bookings ON public.bookings;
CREATE TRIGGER trg_invalidate_dashboard_cache_bookings
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_bookings();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_tickets ON public.tickets;
CREATE TRIGGER trg_invalidate_dashboard_cache_tickets
  AFTER INSERT OR UPDATE OR DELETE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_tickets();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_assignments ON public.admin_seat_assignments;
CREATE TRIGGER trg_invalidate_dashboard_cache_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_seat_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_assignments();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_assignment_items ON public.admin_assignment_items;
CREATE TRIGGER trg_invalidate_dashboard_cache_assignment_items
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_assignment_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_assignment_items();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_admission_records ON public.admission_records;
CREATE TRIGGER trg_invalidate_dashboard_cache_admission_records
  AFTER INSERT OR UPDATE OR DELETE ON public.admission_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_admission_records();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_event_sections ON public.event_sections;
CREATE TRIGGER trg_invalidate_dashboard_cache_event_sections
  AFTER INSERT OR UPDATE OR DELETE ON public.event_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_event_scoped();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_event_seats ON public.event_seats;
CREATE TRIGGER trg_invalidate_dashboard_cache_event_seats
  AFTER INSERT OR UPDATE OR DELETE ON public.event_seats
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_event_scoped();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_event_prices ON public.event_prices;
CREATE TRIGGER trg_invalidate_dashboard_cache_event_prices
  AFTER INSERT OR UPDATE OR DELETE ON public.event_prices
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_event_scoped();

DROP TRIGGER IF EXISTS trg_invalidate_dashboard_cache_events ON public.events;
CREATE TRIGGER trg_invalidate_dashboard_cache_events
  AFTER UPDATE OF event_start, promo_calculator_config ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_invalidate_dashboard_cache_events();
