-- Fix legacy reservation_items check constraint names that reject add-on rows.
-- Some databases still have `reservation_item_seat_or_section` from older migrations.

ALTER TABLE public.reservation_items
  DROP CONSTRAINT IF EXISTS reservation_item_seat_or_section;

ALTER TABLE public.reservation_items
  DROP CONSTRAINT IF EXISTS reservation_items_line_kind_chk;

ALTER TABLE public.reservation_items
  ADD CONSTRAINT reservation_items_line_kind_chk CHECK (
    (
      add_on_id IS NOT NULL
      AND seat_id IS NULL
      AND section_id IS NULL
      AND COALESCE(quantity, 0) >= 1
    )
    OR (
      add_on_id IS NULL
      AND seat_id IS NOT NULL
      AND COALESCE(quantity, 0) >= 1
    )
    OR (
      add_on_id IS NULL
      AND seat_id IS NULL
      AND section_id IS NOT NULL
      AND COALESCE(quantity, 0) >= 1
    )
  );
