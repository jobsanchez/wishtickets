-- Bulk-update event_seat grid positions in one round trip (admin seat selector save).
-- SECURITY DEFINER + is_authorized_for_event avoids flaky multi-row PATCH/RLS behavior.

CREATE OR REPLACE FUNCTION public.admin_patch_event_seat_positions(
  p_event_id uuid,
  p_positions jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event id required';
  END IF;

  IF p_positions IS NULL OR jsonb_typeof(p_positions) <> 'array' THEN
    RAISE EXCEPTION 'positions must be a non-null JSON array';
  END IF;

  IF jsonb_array_length(p_positions) = 0 THEN
    RAISE EXCEPTION 'positions array required';
  END IF;

  IF jsonb_array_length(p_positions) > 15000 THEN
    RAISE EXCEPTION 'at most 15000 seat positions per request';
  END IF;

  IF NOT public.is_authorized_for_event(p_event_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.event_seats AS es
  SET
    grid_x = (sub.seat_elem->>'grid_x')::int,
    grid_y = (sub.seat_elem->>'grid_y')::int
  FROM (
    SELECT jsonb_array_elements(p_positions) AS seat_elem
  ) AS sub
  WHERE es.id = (sub.seat_elem->>'seatId')::uuid
    AND es.event_id = p_event_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_patch_event_seat_positions(uuid, jsonb) TO authenticated;
