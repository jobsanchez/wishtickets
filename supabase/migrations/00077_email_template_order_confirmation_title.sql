-- Email header: "Order Confirmation", remove "Your ticket is ready!"
-- value is JSONB holding the HTML string
UPDATE public.app_config
SET value = to_jsonb(
  regexp_replace(
    replace(value #>> '{}', 'Ticket Confirmation', 'Order Confirmation'),
    '<div style="font-size:[0-9]+px;opacity:0\.9;">Your ticket is ready!</div>\s*',
    '',
    'g'
  )
)
WHERE key = 'email_ticket_body';
