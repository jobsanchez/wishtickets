-- Event title bold; Date and Venue on two lines
UPDATE public.app_config
SET value = to_jsonb(
  replace(
    replace(
      value #>> '{}',
      'Thank you for securing your tickets to {{eventTitle}}.',
      'Thank you for securing your tickets to <strong>{{eventTitle}}</strong>.'
    ),
    '<strong>Date:</strong> {{eventDate}} | <strong>Venue:</strong> {{venueName}}',
    '<strong>Date:</strong> {{eventDate}}</p>' || E'\n    ' || '<p style="margin:0 0 12px 0;font-size:18px;"><strong>Venue:</strong> {{venueName}}'
  )
)
WHERE key = 'email_ticket_body';
