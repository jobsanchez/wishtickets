-- Seat-scoped master scan code: backfill from latest confirmed ticket per seat, else deterministic from event/section/seat labels (matches app formatQrData + buildEncryptedQrFromQrData).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.event_seats
ADD COLUMN IF NOT EXISTS encrypted_qr text;

-- Latest confirmed ticket per seat (pick one row per seat_id; ticket id tie-breaks).
UPDATE public.event_seats es
SET encrypted_qr = sub.enc
FROM (
  SELECT DISTINCT ON (t.seat_id)
    t.seat_id,
    trim(t.encrypted_qr) AS enc
  FROM public.tickets t
  INNER JOIN public.bookings b ON b.id = t.booking_id
  WHERE t.seat_id IS NOT NULL
    AND b.status = 'confirmed'
    AND t.encrypted_qr IS NOT NULL
    AND btrim(t.encrypted_qr) <> ''
  ORDER BY t.seat_id, t.id DESC
) sub
WHERE es.id = sub.seat_id
  AND (es.encrypted_qr IS NULL OR btrim(es.encrypted_qr) = '');

-- Deterministic fallback: mirror lib/qr-data.ts formatQrData + SHA-256 slice.
UPDATE public.event_seats es
SET encrypted_qr = upper(
  substring(
    encode(
      digest(
        upper(
          btrim(
            substring(upper(coalesce(ev.event_code, 'XXX')), 1, 3)
            || substring(rpad(upper(coalesce(sec.section_code, '000')), 3, '0'), 1, 3)
            || coalesce(es.row_label, '-')
            || coalesce(es.seat_number, '-')
          )
        ),
        'sha256'
      ),
      'hex'
    ),
    1,
    10
  )
)
FROM public.events ev,
     public.event_sections sec
WHERE es.event_id = ev.id
  AND es.event_section_id = sec.id
  AND (es.encrypted_qr IS NULL OR btrim(es.encrypted_qr) = '');

CREATE INDEX IF NOT EXISTS idx_event_seats_event_encrypted_qr
  ON public.event_seats (event_id, encrypted_qr)
  WHERE encrypted_qr IS NOT NULL AND btrim(encrypted_qr) <> '';
