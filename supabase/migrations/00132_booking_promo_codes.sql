-- Support multiple promo codes per booking

CREATE TABLE IF NOT EXISTS public.booking_promo_codes (
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  discount_cents int NOT NULL DEFAULT 0,
  PRIMARY KEY (booking_id, promo_code_id)
);

CREATE INDEX IF NOT EXISTS idx_booking_promo_codes_booking ON public.booking_promo_codes(booking_id);

ALTER TABLE public.booking_promo_codes ENABLE ROW LEVEL SECURITY;

-- Same read access as bookings (admins/staff can see)
CREATE POLICY "Booking promos readable by booking owner and admins" ON public.booking_promo_codes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
      AND (b.user_id = auth.uid() OR b.accepted_by_admin_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin', 'admissions_staff'))
  );

-- Insert during checkout (authenticated creating own booking)
CREATE POLICY "Authenticated can insert booking promos" ON public.booking_promo_codes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
      AND (b.user_id = auth.uid() OR b.accepted_by_admin_id = auth.uid())
    )
  );
