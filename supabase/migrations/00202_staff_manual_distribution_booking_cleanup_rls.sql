-- Allow staff (same gates as manual-assignment insert) to UPDATE/DELETE bookings
-- where user_id IS NULL (manual distribution / on-site style), so cookie-backed
-- admin API routes can delete empty bookings and reprice partial releases.
-- Also allow DELETE on payments and booking_promo_codes for those bookings.

CREATE POLICY "Staff can update admin-assignment bookings"
  ON public.bookings
  FOR UPDATE
  USING (
    user_id IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments')
      )
    )
  )
  WITH CHECK (
    user_id IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments')
      )
    )
  );

CREATE POLICY "Staff can delete admin-assignment bookings"
  ON public.bookings
  FOR DELETE
  USING (
    user_id IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin', 'admissions_staff')
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_capabilities uc
        WHERE uc.user_id = auth.uid()
          AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments')
      )
    )
  );

CREATE POLICY "Staff can delete payments for admin-assignment bookings"
  ON public.payments
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_id
        AND b.user_id IS NULL
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'super_admin', 'admissions_staff')
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_capabilities uc
            WHERE uc.user_id = auth.uid()
              AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments')
          )
        )
    )
  );

CREATE POLICY "Staff can delete booking promos for admin-assignment bookings"
  ON public.booking_promo_codes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = booking_id
        AND b.user_id IS NULL
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('admin', 'super_admin', 'admissions_staff')
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_capabilities uc
            WHERE uc.user_id = auth.uid()
              AND uc.capability IN ('manage_seats', 'manage_reservations', 'manage_assignments')
          )
        )
    )
  );
