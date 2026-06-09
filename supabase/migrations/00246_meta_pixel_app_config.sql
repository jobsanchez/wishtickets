-- Meta Pixel: super_admin-editable site tag (enabled + pixel id JSON in app_config)
INSERT INTO public.app_config (key, value)
VALUES ('meta_pixel', '{"enabled":false,"pixel_id":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;
