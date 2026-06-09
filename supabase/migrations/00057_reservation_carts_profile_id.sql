-- Add profile_id to reservation_carts. All carts require auth; no guest carts.
-- Clear existing anonymous carts, then add profile_id (NOT NULL).

DELETE FROM public.reservation_items;
DELETE FROM public.reservation_carts;

ALTER TABLE public.reservation_carts
  ADD COLUMN profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_reservation_carts_profile_event ON public.reservation_carts(profile_id, event_id);

-- RLS: users can only access their own carts
DROP POLICY IF EXISTS "Public can manage reservation carts" ON public.reservation_carts;
CREATE POLICY "Users can manage own reservation carts" ON public.reservation_carts
  FOR ALL USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
