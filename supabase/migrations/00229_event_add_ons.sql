-- Event add-ons (merch) for book page + checkout; inventory on event_add_ons.

CREATE TABLE public.event_add_ons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX event_add_ons_event_sort_idx
  ON public.event_add_ons (event_id, sort_order);

ALTER TABLE public.event_add_ons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read event_add_ons for book flow"
  ON public.event_add_ons
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_add_ons.event_id
        AND e.status IN ('draft', 'published')
    )
  );

CREATE POLICY "Authorized staff manage event_add_ons"
  ON public.event_add_ons
  FOR ALL
  TO authenticated
  USING (public.is_authorized_for_event(event_id))
  WITH CHECK (public.is_authorized_for_event(event_id));

-- Cart lines for add-ons (seat_id and section_id null)
ALTER TABLE public.reservation_items
  ADD COLUMN IF NOT EXISTS add_on_id uuid REFERENCES public.event_add_ons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reservation_items_add_on_id
  ON public.reservation_items (add_on_id)
  WHERE add_on_id IS NOT NULL;

COMMENT ON COLUMN public.reservation_items.add_on_id IS
  'Merch line: quantity holds units; seat_id and section_id must be null.';

ALTER TABLE public.reservation_items DROP CONSTRAINT IF EXISTS reservation_items_line_kind_chk;

ALTER TABLE public.reservation_items
  ADD CONSTRAINT reservation_items_line_kind_chk CHECK (
    (
      add_on_id IS NOT NULL
      AND seat_id IS NULL
      AND section_id IS NULL
      AND COALESCE(quantity, 0) >= 1
    )
    OR (
      add_on_id IS NULL
      AND seat_id IS NOT NULL
      AND COALESCE(quantity, 0) >= 1
    )
    OR (
      add_on_id IS NULL
      AND seat_id IS NULL
      AND section_id IS NOT NULL
      AND COALESCE(quantity, 0) >= 1
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS reservation_items_cart_add_on_unique
  ON public.reservation_items (cart_id, add_on_id)
  WHERE add_on_id IS NOT NULL;

-- Snapshot lines after booking (fulfillment / reporting)
CREATE TABLE public.booking_add_ons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_add_on_id uuid REFERENCES public.event_add_ons(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price_cents integer NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_add_ons_booking_id_idx
  ON public.booking_add_ons (booking_id);

ALTER TABLE public.booking_add_ons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert booking_add_ons for own booking"
  ON public.booking_add_ons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

CREATE POLICY "Users read own booking_add_ons"
  ON public.booking_add_ons
  FOR SELECT
  TO authenticated
  USING (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

CREATE POLICY "Staff can read booking_add_ons"
  ON public.booking_add_ons
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'super_admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.user_capabilities uc
      WHERE uc.user_id = auth.uid()
        AND uc.capability IN ('manage_events', 'manage_seats', 'manage_prices')
    )
  );

-- Event admins with explicit section lists can open the new Add-Ons tab.
UPDATE public.event_administrators
SET allowed_sections = allowed_sections || ARRAY['addOns']::text[]
WHERE allowed_sections IS NOT NULL
  AND cardinality(allowed_sections) > 0
  AND NOT ('addOns' = ANY (allowed_sections));
