-- Hotfix: pgcrypto digest/encode require schema `extensions` on Supabase (SET search_path = public, extensions) and explicit `'sha256'::text` / `'hex'::text` overloads.

CREATE OR REPLACE FUNCTION public.duplicate_admin_event(p_source_id uuid, p_new_title text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_old public.events%ROWTYPE;
  v_new_id uuid;
  v_slug text;
  v_base_slug text;
  v_n int;
  v_evt_code text;
  c record;
  s record;
  es record;
  ep record;
  eb record;
  pr record;
  pr_code text;
  adm record;
  v_adm_loop int;
  v_promo_inserted boolean;
  v_new_canvas_id uuid;
  v_new_sec_id uuid;
  v_sec_code text;
  v_scan text;
  v_enc text;
  v_adm_code text;
BEGIN
  IF trim(coalesce(p_new_title, '')) = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  IF NOT public.is_authorized_for_event(p_source_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_old FROM public.events WHERE id = p_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  v_base_slug := trim(both '-' from regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(trim(lower(p_new_title)), '[[:space:]]+', '-', 'g'),
        '[^a-z0-9-]', '', 'g'),
      '-{2,}', '-', 'g'),
    '^-+|-+$', '', 'g'
  ));

  IF v_base_slug IS NULL OR v_base_slug = '' THEN
    v_base_slug := 'event';
  END IF;

  v_slug := v_base_slug;
  v_n := 2;
  WHILE EXISTS (SELECT 1 FROM public.events WHERE slug = v_slug) LOOP
    v_slug := v_base_slug || '-' || v_n::text;
    v_n := v_n + 1;
    IF v_n > 10000 THEN
      RAISE EXCEPTION 'Could not allocate unique slug';
    END IF;
  END LOOP;

  INSERT INTO public.events (
    id,
    title,
    slug,
    description,
    short_description,
    category,
    status,
    featured,
    image_url,
    thumbnail_url,
    teaser_video_url,
    venue_id,
    venue_to_be_announced,
    schedule_to_be_announced,
    event_start,
    producer_id,
    cart_time_duration_minutes,
    ticket_purchase_per_user,
    seat_layout_image_url,
    seat_layout_scale,
    seat_layout_opacity,
    seat_map_image_urls,
    ticket_template_image_url,
    ticket_layout_config,
    promo_calculator_config,
    sale_success_email_enabled,
    early_bird_enabled,
    early_bird_starts_at,
    early_bird_ends_at,
    sale_label,
    event_code,
    created_by
  )
  VALUES (
    gen_random_uuid(),
    trim(p_new_title),
    v_slug,
    v_old.description,
    v_old.short_description,
    v_old.category,
    'draft',
    false,
    v_old.image_url,
    v_old.thumbnail_url,
    v_old.teaser_video_url,
    v_old.venue_id,
    v_old.venue_to_be_announced,
    v_old.schedule_to_be_announced,
    v_old.event_start,
    v_old.producer_id,
    v_old.cart_time_duration_minutes,
    v_old.ticket_purchase_per_user,
    v_old.seat_layout_image_url,
    v_old.seat_layout_scale,
    v_old.seat_layout_opacity,
    v_old.seat_map_image_urls,
    v_old.ticket_template_image_url,
    v_old.ticket_layout_config,
    v_old.promo_calculator_config,
    v_old.sale_success_email_enabled,
    v_old.early_bird_enabled,
    v_old.early_bird_starts_at,
    v_old.early_bird_ends_at,
    v_old.sale_label,
    NULL,
    auth.uid()
  )
  RETURNING id INTO v_new_id;

  SELECT e.event_code INTO STRICT v_evt_code FROM public.events e WHERE e.id = v_new_id;

  DROP TABLE IF EXISTS dup_duplicate_canvas_map;
  CREATE TEMP TABLE dup_duplicate_canvas_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  DROP TABLE IF EXISTS dup_duplicate_section_map;
  CREATE TEMP TABLE dup_duplicate_section_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR c IN
    SELECT * FROM public.event_layout_canvases
    WHERE event_id = p_source_id
    ORDER BY sort_order ASC, created_at ASC, id ASC
  LOOP
    INSERT INTO public.event_layout_canvases (event_id, image_url, scale, opacity, sort_order)
    VALUES (v_new_id, c.image_url, c.scale, c.opacity, c.sort_order)
    RETURNING id INTO v_new_canvas_id;
    INSERT INTO dup_duplicate_canvas_map (old_id, new_id)
    VALUES (c.id, v_new_canvas_id);
  END LOOP;

  FOR s IN
    SELECT * FROM public.event_sections
    WHERE event_id = p_source_id
    ORDER BY sort_order ASC, name ASC, id ASC
  LOOP
    INSERT INTO public.event_sections (
      event_id,
      name,
      section_code,
      capacity,
      sort_order,
      seating_type,
      show_seat_selection,
      color,
      column_direction,
      section_group,
      seat_layout_canvas_id,
      seat_layout_image_url,
      seat_layout_scale,
      seat_layout_opacity
    )
    VALUES (
      v_new_id,
      s.name,
      s.section_code,
      s.capacity,
      s.sort_order,
      s.seating_type,
      s.show_seat_selection,
      s.color,
      s.column_direction,
      s.section_group,
      CASE
        WHEN s.seat_layout_canvas_id IS NULL THEN NULL
        ELSE (SELECT m.new_id FROM dup_duplicate_canvas_map m WHERE m.old_id = s.seat_layout_canvas_id LIMIT 1)
      END,
      s.seat_layout_image_url,
      s.seat_layout_scale,
      s.seat_layout_opacity
    )
    RETURNING id INTO v_new_sec_id;

    INSERT INTO dup_duplicate_section_map (old_id, new_id)
    VALUES (s.id, v_new_sec_id);
  END LOOP;

  FOR es IN
    SELECT src_seat.* FROM public.event_seats src_seat
    WHERE src_seat.event_id = p_source_id
    ORDER BY src_seat.event_section_id, src_seat.row_label::text, src_seat.seat_number::text, src_seat.id
  LOOP
    SELECT dm.new_id INTO v_new_sec_id
    FROM dup_duplicate_section_map dm
    WHERE dm.old_id = es.event_section_id
    LIMIT 1;

    IF v_new_sec_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT sec.section_code INTO v_sec_code
    FROM public.event_sections sec
    WHERE sec.id = v_new_sec_id;

    LOOP
      v_scan := public.generate_alphanumeric_4();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.event_seats x
        WHERE x.event_id = v_new_id AND x.scan_code = v_scan
      );
    END LOOP;

    v_enc := upper(substring(
      encode(
        digest(
          upper(btrim(
            substring(upper(coalesce(v_evt_code, 'XXX')), 1, 3)
              || substring(rpad(upper(coalesce(v_sec_code, '000')), 3, '0'), 1, 3)
              || coalesce(es.row_label::text, '-')
              || coalesce(es.seat_number::text, '-')
          )),
          'sha256'::text
        ),
        'hex'::text
      ),
      1,
      10
    ));

    INSERT INTO public.event_seats (
      event_id,
      event_section_id,
      row_label,
      seat_number,
      scan_code,
      encrypted_qr,
      grid_x,
      grid_y,
      status
    )
    VALUES (
      v_new_id,
      v_new_sec_id,
      es.row_label,
      es.seat_number,
      v_scan,
      v_enc,
      es.grid_x,
      es.grid_y,
      'available'
    );
  END LOOP;

  FOR ep IN SELECT * FROM public.event_prices WHERE event_id = p_source_id LOOP
    INSERT INTO public.event_prices (event_id, section_id, price_cents)
    VALUES (
      v_new_id,
      COALESCE(
        (SELECT dm.new_id FROM dup_duplicate_section_map dm WHERE dm.old_id = ep.section_id LIMIT 1),
        ep.section_id
      ),
      ep.price_cents
    );
  END LOOP;

  FOR eb IN SELECT * FROM public.early_bird_prices WHERE event_id = p_source_id LOOP
    INSERT INTO public.early_bird_prices (event_id, section_id, discount_percent)
    VALUES (
      v_new_id,
      COALESCE(
        (SELECT dm.new_id FROM dup_duplicate_section_map dm WHERE dm.old_id = eb.section_id LIMIT 1),
        eb.section_id
      ),
      eb.discount_percent
    );
  END LOOP;

  FOR pr IN SELECT * FROM public.promo_codes WHERE event_id = p_source_id LOOP
    v_promo_inserted := false;
    FOR promo_try IN 1 .. 200 LOOP
      pr_code := pr.code || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 10);
      IF length(pr_code) > 240 THEN
        pr_code := 'DUP-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 20);
      END IF;
      BEGIN
        INSERT INTO public.promo_codes (
          code,
          event_id,
          discount_type,
          discount_value,
          max_uses,
          used_count,
          starts_at,
          expires_at,
          active,
          stackable
        )
        VALUES (
          pr_code,
          v_new_id,
          pr.discount_type,
          pr.discount_value,
          pr.max_uses,
          0,
          pr.starts_at,
          pr.expires_at,
          pr.active,
          COALESCE(pr.stackable, false)
        );
        v_promo_inserted := true;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
    IF NOT v_promo_inserted THEN
      RAISE EXCEPTION 'Could not duplicate promo_codes row (unique constraint)';
    END IF;
  END LOOP;

  INSERT INTO public.event_add_ons (event_id, title, image_url, price_cents, stock_quantity, sort_order)
  SELECT v_new_id, a.title, a.image_url, a.price_cents, a.stock_quantity, a.sort_order
  FROM public.event_add_ons a
  WHERE a.event_id = p_source_id;

  INSERT INTO public.event_banners (event_id, image_url, sort_order, is_active)
  SELECT v_new_id, b.image_url, b.sort_order, b.is_active
  FROM public.event_banners b
  WHERE b.event_id = p_source_id;

  FOR adm IN SELECT * FROM public.event_admissions_codes WHERE event_id = p_source_id LOOP
    v_adm_loop := 0;
    LOOP
      v_adm_loop := v_adm_loop + 1;
      IF v_adm_loop > 600 THEN
        RAISE EXCEPTION 'Could not allocate unique admissions code';
      END IF;
      v_adm_code := public.generate_admissions_code_8();
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.event_admissions_codes x WHERE upper(trim(x.code)) = upper(trim(v_adm_code))
      );
    END LOOP;
    INSERT INTO public.event_admissions_codes (event_id, code, label, assignee_email)
    VALUES (v_new_id, v_adm_code, adm.label, adm.assignee_email);
  END LOOP;

  INSERT INTO public.event_administrators (event_id, user_id, created_at, allowed_sections)
  SELECT v_new_id, ea.user_id, now(), ea.allowed_sections
  FROM public.event_administrators ea
  WHERE ea.event_id = p_source_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.duplicate_admin_event(uuid, text) TO authenticated;
