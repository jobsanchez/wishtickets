-- Meta Pixel / custom head snippet for marketing (editable in Global Settings)
INSERT INTO public.app_config (key, value)
VALUES ('meta_pixel_head_code', '{"head_html":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
