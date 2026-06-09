-- Email template and global ticket template config (app_config)
-- Used for ticket delivery emails and default ticket design across all events

INSERT INTO public.app_config (key, value) VALUES
  ('email_ticket_subject', '"Your tickets: {{eventTitle}}"'::jsonb),
  ('email_ticket_body', '"<h2>Your tickets for {{eventTitle}}</h2><p><strong>Date:</strong> {{eventDate}}</p><p><strong>Venue:</strong> {{venueName}}</p><p>Please find your QR ticket(s) attached. Present them at the venue.</p>"'::jsonb),
  ('global_ticket_template_url', 'null'::jsonb),
  ('global_ticket_layout_config', 'null'::jsonb)
ON CONFLICT (key) DO NOTHING;
