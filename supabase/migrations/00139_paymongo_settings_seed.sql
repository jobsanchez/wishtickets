-- Seed default paymongo_mode for Paymongo Control Panel (super_admin manages via Global Settings).
INSERT INTO public.app_config (key, value) VALUES
  ('paymongo_mode', '"test"'::jsonb)
ON CONFLICT (key) DO NOTHING;
