-- Early bird pricing: lower price if purchased before cutoff date
-- section_id references event_sections.id or sections.id (same as event_prices)

CREATE TABLE IF NOT EXISTS public.early_bird_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  section_id uuid NOT NULL,
  price_cents int NOT NULL DEFAULT 0,
  cutoff_at timestamptz NOT NULL,
  UNIQUE(event_id, section_id)
);

CREATE INDEX idx_early_bird_prices_event ON public.early_bird_prices(event_id);

ALTER TABLE public.early_bird_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage early_bird_prices" ON public.early_bird_prices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.user_capabilities uc WHERE uc.user_id = auth.uid() AND uc.capability IN ('manage_events', 'manage_prices'))
  );

CREATE POLICY "Public can read early_bird_prices" ON public.early_bird_prices FOR SELECT USING (true);
