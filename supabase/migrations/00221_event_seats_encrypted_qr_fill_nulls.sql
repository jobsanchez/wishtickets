-- Fill `encrypted_qr` for seats that were created before app inserts set it (deterministic hash; requires pgcrypto from 00220).

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
