INSERT INTO public.app_config (key, value)
VALUES ('global_ticket_dpi', to_jsonb(300))
ON CONFLICT (key) DO NOTHING;
