INSERT INTO public.app_config (key, value)
VALUES
  ('global_ticket_width_px', to_jsonb(750)),
  ('global_ticket_height_px', to_jsonb(1650)),
  ('global_ticket_jpeg_quality', to_jsonb(90))
ON CONFLICT (key) DO NOTHING;
