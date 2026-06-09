-- Per–event administrator page access: allowed_sections on event_administrators.
-- Super admins bypass via is_authorized_for_event_section (first branch).
-- NULL or empty allowed_sections = full access (backward compatible).

ALTER TABLE public.event_administrators
  ADD COLUMN IF NOT EXISTS allowed_sections text[] NULL;

UPDATE public.event_administrators
SET allowed_sections = ARRAY[
  'details',
  'admissionsCodes',
  'auditTrail',
  'eventAdministrators',
  'assign',
  'printTickets',
  'promo',
  'promoCalculator',
  'reservedSeats',
  'pricing',
  'seating',
  'selector',
  'seatHold',
  'ticketTemplate'
]::text[]
WHERE allowed_sections IS NULL;

CREATE OR REPLACE FUNCTION public.is_authorized_for_event_section(p_event_id uuid, p_section text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role::text = 'super_admin'
  )
  OR (
    public.is_authorized_for_event(p_event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id
        AND ea.user_id = auth.uid()
        AND (
          ea.allowed_sections IS NULL
          OR cardinality(ea.allowed_sections) = 0
          OR p_section = ANY (ea.allowed_sections)
        )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_for_event_section(uuid, text) TO authenticated;

-- Event admin managers: super_admin, or assigned admin with "eventAdministrators" page access.
CREATE OR REPLACE FUNCTION public.is_authorized_event_admin_manager(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role::text = 'super_admin'
  )
  OR (
    public.is_authorized_for_event(p_event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_administrators ea
      WHERE ea.event_id = p_event_id
        AND ea.user_id = auth.uid()
        AND (
          ea.allowed_sections IS NULL
          OR cardinality(ea.allowed_sections) = 0
          OR 'eventAdministrators' = ANY (ea.allowed_sections)
        )
    )
  );
$$;
