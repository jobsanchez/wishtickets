-- Meta Pixel / custom head snippet feature removed from the app.
DELETE FROM public.app_config WHERE key = 'meta_pixel_head_code';
