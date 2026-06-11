-- Raise default inactivity auto-logout window from 5 to 15 minutes.

UPDATE public.app_config
SET value = '15'::jsonb
WHERE key = 'inactivity_auto_logout_minutes';

INSERT INTO public.app_config (key, value)
VALUES ('inactivity_auto_logout_minutes', '15'::jsonb)
ON CONFLICT (key) DO NOTHING;
