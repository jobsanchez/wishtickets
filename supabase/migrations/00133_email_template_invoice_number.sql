-- Add Invoice # placeholder to ticket email template (for PayMongo reference)
UPDATE public.app_config
SET value = to_jsonb(
  replace(
    value #>> '{}',
    '<strong>Total: {{total}}</strong></p>
    <p style="margin:0 0 12px 0;font-size:18px;">Your ticket images are attached',
    '<strong>Total: {{total}}</strong></p>
    <p style="margin:0 0 12px 0;font-size:18px;">Invoice #: {{invoiceNumber}}</p>
    <p style="margin:0 0 12px 0;font-size:18px;">Your ticket images are attached'
  )
)
WHERE key = 'email_ticket_body'
  AND value #>> '{}' LIKE '%Total: {{total}}%'
  AND value #>> '{}' NOT LIKE '%{{invoiceNumber}}%';
