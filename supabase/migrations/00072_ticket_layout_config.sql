-- Per-event ticket layout config for visual editor (positions in px, 797x1500 canvas)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ticket_layout_config jsonb;

COMMENT ON COLUMN public.events.ticket_layout_config IS 'JSON: { eventInfo, section, price, qr, ticketNumber } positions/sizes for 797x1500 canvas';
