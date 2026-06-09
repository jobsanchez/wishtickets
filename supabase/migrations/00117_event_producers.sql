-- Event Producers: track events by producer (name, representative, contact, email)
CREATE TABLE IF NOT EXISTS public.event_producers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  producer_representative text,
  contact text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_producers_name ON public.event_producers(name);

-- Add producer_id to events (nullable, FK with SET NULL on delete)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS producer_id uuid REFERENCES public.event_producers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_producer ON public.events(producer_id);

-- RLS on event_producers (same access as events: super_admin, admin, or manage_events)
ALTER TABLE public.event_producers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and manage_events can manage event_producers" ON public.event_producers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role::text = 'super_admin')
    OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role::text = 'admin')
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability = 'manage_events')
  );

-- Update update_admin_event RPC to include producer_id
DROP FUNCTION IF EXISTS public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid, int);

CREATE OR REPLACE FUNCTION public.update_admin_event(
  p_id uuid,
  p_title text,
  p_slug text,
  p_description text,
  p_category text,
  p_status text,
  p_image_url text,
  p_teaser_video_url text,
  p_event_start timestamptz,
  p_venue_id uuid,
  p_cart_time_duration_minutes int DEFAULT 15,
  p_producer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_authorized_for_event(p_id) THEN
    RETURN NULL;
  END IF;
  UPDATE public.events
  SET title = p_title, slug = p_slug, description = p_description,
      short_description = left(p_description, 200), category = p_category,
      status = p_status::text, image_url = p_image_url, teaser_video_url = p_teaser_video_url,
      event_start = p_event_start, venue_id = p_venue_id,
      cart_time_duration_minutes = greatest(1, least(120, coalesce(p_cart_time_duration_minutes, 15))),
      producer_id = p_producer_id
  WHERE id = p_id;
  RETURN p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_admin_event(uuid, text, text, text, text, text, text, text, timestamptz, uuid, int, uuid) TO authenticated;
