-- Public "To be announced" for venue and schedule (admin-controlled).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS venue_to_be_announced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_to_be_announced boolean NOT NULL DEFAULT false;

-- Required before RPC can set venue_id NULL for "To be announced" (otherwise 23502).
ALTER TABLE public.events
  ALTER COLUMN venue_id DROP NOT NULL;

COMMENT ON COLUMN public.events.venue_to_be_announced IS 'When true, public UI shows venue as TBA; venue_id should be null.';
COMMENT ON COLUMN public.events.schedule_to_be_announced IS 'When true, public UI shows date/time as TBA; event_start still used for sorting.';

DROP FUNCTION IF EXISTS public.update_admin_event(
  uuid, text, text, text, text, text, text, text, text, timestamptz, uuid, int, uuid, int
);

CREATE OR REPLACE FUNCTION public.update_admin_event(
  p_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category text,
  p_status text,
  p_image_url text,
  p_thumbnail_url text,
  p_teaser_video_url text,
  p_event_start timestamptz,
  p_venue_id uuid,
  p_cart_time_duration_minutes int DEFAULT 15,
  p_producer_id uuid DEFAULT NULL,
  p_ticket_purchase_per_user int DEFAULT 0,
  p_venue_to_be_announced boolean DEFAULT false,
  p_schedule_to_be_announced boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venue_tba boolean := coalesce(p_venue_to_be_announced, false);
  v_schedule_tba boolean := coalesce(p_schedule_to_be_announced, false);
BEGIN
  IF NOT public.is_authorized_for_event(p_id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.events
  SET title = p_title,
      slug = p_slug,
      description = p_description,
      short_description = left(p_description, 200),
      category = p_category,
      status = p_status::text,
      image_url = p_image_url,
      thumbnail_url = p_thumbnail_url,
      teaser_video_url = p_teaser_video_url,
      event_start = p_event_start,
      venue_id = CASE WHEN v_venue_tba THEN NULL ELSE p_venue_id END,
      venue_to_be_announced = v_venue_tba,
      schedule_to_be_announced = v_schedule_tba,
      cart_time_duration_minutes = greatest(
        1,
        least(120, coalesce(p_cart_time_duration_minutes, 15))
      ),
      producer_id = p_producer_id,
      ticket_purchase_per_user = greatest(0, coalesce(p_ticket_purchase_per_user, 0))
  WHERE id = p_id;

  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(
  uuid, text, text, text, text, text, text, text, text, timestamptz, uuid, int, uuid, int, boolean, boolean
) TO authenticated;
