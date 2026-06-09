-- Allow anyone (including anonymous) to read published events
DROP POLICY IF EXISTS "Public can read published events" ON public.events;
CREATE POLICY "Public can read published events" ON public.events
  FOR SELECT USING (status = 'published');
