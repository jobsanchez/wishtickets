-- RLS policies for public booking flow without service role:
-- - Public read on venues, seats, sections (layout for seat picker)
-- - Anon full access on reservation_carts, reservation_items (anonymous carts)
-- - Users insert/read own bookings, insert tickets/payments for own booking

-- Venues: public read (for event pages)
CREATE POLICY "Public can read venues" ON public.venues
  FOR SELECT USING (true);

-- Seats: public read (for seat map)
CREATE POLICY "Public can read seats" ON public.seats
  FOR SELECT USING (true);

-- Sections: public read (for section picker)
CREATE POLICY "Public can read sections" ON public.sections
  FOR SELECT USING (true);

-- Reservation carts: anon + auth can create, read, update, delete (cart_id is unguessable UUID)
ALTER TABLE public.reservation_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage reservation carts" ON public.reservation_carts
  FOR ALL USING (true) WITH CHECK (true);

-- Reservation items: anon + auth can create, read, update, delete
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage reservation items" ON public.reservation_items
  FOR ALL USING (true) WITH CHECK (true);

-- Bookings: users can insert own, read own (admin/staff read all is already in 00008)
CREATE POLICY "Users can insert own bookings" ON public.bookings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own bookings" ON public.bookings
  FOR SELECT USING (user_id = auth.uid());

-- Tickets: users can insert for own booking (staff read/update is already in 00008)
CREATE POLICY "Users can insert tickets for own booking" ON public.tickets
  FOR INSERT WITH CHECK (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );

-- Payments: users can insert for own booking (admin read is already in 00008)
CREATE POLICY "Users can insert payments for own booking" ON public.payments
  FOR INSERT WITH CHECK (
    booking_id IN (SELECT id FROM public.bookings WHERE user_id = auth.uid())
  );
