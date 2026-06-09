import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { releaseFailedBooking } from "@/lib/release-failed-booking";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "reservedSeats");
  if (denied) return denied;

  const supabase = await createClient();

  const { data: seats, error: seatsError } = await supabase
    .from("event_seats")
    .select("id, event_section_id, row_label, seat_number")
    .eq("event_id", eventId)
    .or("status.eq.reserved,assignment_id.not.is.null")
    .order("event_section_id")
    .order("row_label")
    .order("seat_number");
  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 500 });
  }

  const sectionIds = [
    ...new Set((seats ?? []).map((s) => s.event_section_id).filter(Boolean)),
  ];
  const { data: sections, error: sectionsError } = sectionIds.length > 0
    ? await supabase
        .from("event_sections")
        .select("id, name, section_code")
        .in("id", sectionIds)
        .order("sort_order")
        .order("name")
    : { data: [], error: null };
  if (sectionsError) {
    return NextResponse.json({ error: sectionsError.message }, { status: 500 });
  }

  const bySection = new Map<string, NonNullable<typeof seats>>();
  for (const seat of seats ?? []) {
    const sid = seat.event_section_id ?? "";
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid)!.push(seat);
  }

  const orderedSections = (sections ?? []).filter((s) => bySection.has(s.id));
  const result = orderedSections.map((sec) => ({
    id: sec.id,
    name: sec.name ?? sec.section_code ?? "—",
    section_code: sec.section_code ?? null,
    seats: (bySection.get(sec.id) ?? []).map((s) => ({
      id: s.id,
      row_label: s.row_label ?? null,
      seat_number: s.seat_number ?? null,
    })),
  }));

  const now = new Date().toISOString();
  const { data: activeCarts, error: cartsError } = await supabase
    .from("reservation_carts")
    .select("id, expires_at, profile_id")
    .eq("event_id", eventId)
    .gt("expires_at", now)
    .order("expires_at", { ascending: true });
  if (cartsError) {
    return NextResponse.json({ error: cartsError.message }, { status: 500 });
  }

  const cartIds = (activeCarts ?? []).map((c) => c.id);
  const profileIds = [
    ...new Set(
      (activeCarts ?? [])
        .map((c) => c.profile_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const cartExpiryById = new Map(
    (activeCarts ?? []).map((c) => [c.id, c.expires_at ?? null])
  );
  const cartProfileById = new Map(
    (activeCarts ?? []).map((c) => [c.id, c.profile_id ?? null])
  );

  const admin = createAdminClient();
  const { data: ownerProfiles } =
    profileIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", profileIds)
      : { data: [] };
  const ownerNameByProfileId = new Map(
    (ownerProfiles ?? []).map((p) => [p.id, p.full_name ?? null])
  );
  const ownerEmailByProfileId = new Map<string, string | null>();
  for (const profileId of profileIds) {
    try {
      const authRes = await admin.auth.admin.getUserById(profileId);
      ownerEmailByProfileId.set(profileId, authRes.data.user?.email ?? null);
    } catch {
      ownerEmailByProfileId.set(profileId, null);
    }
  }

  const { data: holdRows, error: holdRowsError } =
    cartIds.length > 0
      ? await supabase
          .from("reservation_items")
          .select("id, seat_id, cart_id")
          .in("cart_id", cartIds)
          .not("seat_id", "is", null)
      : { data: [], error: null };
  if (holdRowsError) {
    return NextResponse.json({ error: holdRowsError.message }, { status: 500 });
  }

  const holdSeatIds = [...new Set((holdRows ?? []).map((row) => row.seat_id as string))];
  const { data: holdSeats, error: holdSeatsError } =
    holdSeatIds.length > 0
      ? await supabase
          .from("event_seats")
          .select("id, row_label, seat_number, event_section_id")
          .in("id", holdSeatIds)
      : { data: [], error: null };
  if (holdSeatsError) {
    return NextResponse.json({ error: holdSeatsError.message }, { status: 500 });
  }
  const holdSeatById = new Map((holdSeats ?? []).map((s) => [s.id, s]));

  const holdSectionIds = [
    ...new Set(
      (holdRows ?? [])
        .map((row) => {
          const seat = holdSeatById.get(row.seat_id as string);
          return seat?.event_section_id ?? null;
        })
        .filter(Boolean)
    ),
  ];
  const { data: holdSections, error: holdSectionsError } =
    holdSectionIds.length > 0
      ? await supabase
          .from("event_sections")
          .select("id, name, section_code")
          .in("id", holdSectionIds)
      : { data: [], error: null };
  if (holdSectionsError) {
    return NextResponse.json({ error: holdSectionsError.message }, { status: 500 });
  }

  const sectionNameById = new Map(
    (holdSections ?? []).map((s) => [s.id, s.name ?? s.section_code ?? "—"])
  );

  const activeCartHolds = (holdRows ?? []).map((row) => {
    const seat = holdSeatById.get(row.seat_id as string);
    return {
      hold_source: "active_cart_hold" as const,
      reservation_item_id: row.id,
      cart_id: row.cart_id,
      seat_id: row.seat_id,
      row_label: seat?.row_label ?? null,
      seat_number: seat?.seat_number ?? null,
      section_id: seat?.event_section_id ?? null,
      section_name: seat?.event_section_id
        ? sectionNameById.get(seat.event_section_id) ?? "—"
        : "—",
      expires_at: cartExpiryById.get(row.cart_id) ?? null,
      owner_name: (() => {
        const pid = cartProfileById.get(row.cart_id);
        return pid ? ownerNameByProfileId.get(pid) ?? null : null;
      })(),
      owner_email: (() => {
        const pid = cartProfileById.get(row.cart_id);
        return pid ? ownerEmailByProfileId.get(pid) ?? null : null;
      })(),
    };
  });

  const { data: pendingBookings, error: pendingBookingsError } = await supabase
    .from("bookings")
    .select("id, user_id, created_at")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (pendingBookingsError) {
    return NextResponse.json({ error: pendingBookingsError.message }, { status: 500 });
  }

  const pendingBookingIds = (pendingBookings ?? []).map((b) => b.id);
  const pendingBookingById = new Map((pendingBookings ?? []).map((b) => [b.id, b]));

  const { data: pendingPayments, error: pendingPaymentsError } =
    pendingBookingIds.length > 0
      ? await supabase
          .from("payments")
          .select("booking_id, paymongo_id, expires_at, status, created_at")
          .in("booking_id", pendingBookingIds)
      : { data: [], error: null };
  if (pendingPaymentsError) {
    return NextResponse.json({ error: pendingPaymentsError.message }, { status: 500 });
  }
  const paymentByBookingId = new Map<string, NonNullable<typeof pendingPayments>[number]>();
  for (const payment of pendingPayments ?? []) {
    const current = paymentByBookingId.get(payment.booking_id);
    if (!current) {
      paymentByBookingId.set(payment.booking_id, payment);
      continue;
    }
    const currentTs = current.created_at ? new Date(current.created_at).getTime() : 0;
    const nextTs = payment.created_at ? new Date(payment.created_at).getTime() : 0;
    if (nextTs >= currentTs) {
      paymentByBookingId.set(payment.booking_id, payment);
    }
  }

  const nowMs = Date.now();
  const stalePendingBookingIds = pendingBookingIds.filter((bookingId) => {
    const payment = paymentByBookingId.get(bookingId);
    if (!payment) return true;
    const status = (payment.status ?? "").toLowerCase();
    if (status !== "pending") {
      return true;
    }
    if (payment.expires_at && new Date(payment.expires_at).getTime() <= nowMs) {
      return true;
    }
    return false;
  });

  if (stalePendingBookingIds.length > 0) {
    const adminForCleanup = createAdminClient();
    for (const bookingId of stalePendingBookingIds) {
      await releaseFailedBooking(adminForCleanup, bookingId);
      await adminForCleanup.from("bookings").update({ status: "failed" }).eq("id", bookingId);
      await adminForCleanup
        .from("payments")
        .update({ status: "failed" })
        .eq("booking_id", bookingId)
        .eq("status", "pending");
    }
  }

  const validPendingBookingIds = pendingBookingIds.filter(
    (bookingId) => !stalePendingBookingIds.includes(bookingId)
  );

  const { data: pendingTickets, error: pendingTicketsError } =
    validPendingBookingIds.length > 0
      ? await supabase
          .from("tickets")
          .select("id, booking_id, seat_id, section_id")
          .in("booking_id", validPendingBookingIds)
      : { data: [], error: null };
  if (pendingTicketsError) {
    return NextResponse.json({ error: pendingTicketsError.message }, { status: 500 });
  }

  const pendingSeatIds = [
    ...new Set(
      (pendingTickets ?? [])
        .map((t) => t.seat_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: pendingSeats, error: pendingSeatsError } =
    pendingSeatIds.length > 0
      ? await supabase
          .from("event_seats")
          .select("id, row_label, seat_number, event_section_id")
          .in("id", pendingSeatIds)
      : { data: [], error: null };
  if (pendingSeatsError) {
    return NextResponse.json({ error: pendingSeatsError.message }, { status: 500 });
  }
  const pendingSeatById = new Map((pendingSeats ?? []).map((s) => [s.id, s]));

  const pendingSectionIds = [
    ...new Set(
      (pendingTickets ?? [])
        .map((ticket) => {
          if (ticket.section_id) return ticket.section_id;
          const seat = ticket.seat_id ? pendingSeatById.get(ticket.seat_id) : null;
          return seat?.event_section_id ?? null;
        })
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: pendingSections, error: pendingSectionsError } =
    pendingSectionIds.length > 0
      ? await supabase
          .from("event_sections")
          .select("id, name, section_code")
          .in("id", pendingSectionIds)
      : { data: [], error: null };
  if (pendingSectionsError) {
    return NextResponse.json({ error: pendingSectionsError.message }, { status: 500 });
  }
  const pendingSectionNameById = new Map(
    (pendingSections ?? []).map((s) => [s.id, s.name ?? s.section_code ?? "—"])
  );

  const pendingProfileIds = [
    ...new Set(
      (pendingBookings ?? [])
        .map((b) => b.user_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const { data: pendingOwnerProfiles } =
    pendingProfileIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", pendingProfileIds)
      : { data: [] };
  const pendingOwnerNameByProfileId = new Map(
    (pendingOwnerProfiles ?? []).map((p) => [p.id, p.full_name ?? null])
  );
  const pendingOwnerEmailByProfileId = new Map<string, string | null>();
  for (const profileId of pendingProfileIds) {
    try {
      const authRes = await admin.auth.admin.getUserById(profileId);
      pendingOwnerEmailByProfileId.set(profileId, authRes.data.user?.email ?? null);
    } catch {
      pendingOwnerEmailByProfileId.set(profileId, null);
    }
  }

  const pendingBookingHolds = (pendingTickets ?? []).map((ticket) => {
    const booking = pendingBookingById.get(ticket.booking_id);
    const ownerProfileId = booking?.user_id ?? null;
    const seat = ticket.seat_id ? pendingSeatById.get(ticket.seat_id) : null;
    const sectionId = ticket.section_id ?? seat?.event_section_id ?? null;
    const payment = paymentByBookingId.get(ticket.booking_id);
    return {
      hold_source: "pending_booking" as const,
      ticket_id: ticket.id,
      booking_id: ticket.booking_id,
      paymongo_reference: ticket.booking_id,
      paymongo_id: payment?.paymongo_id ?? null,
      seat_id: ticket.seat_id ?? null,
      row_label: seat?.row_label ?? null,
      seat_number: seat?.seat_number ?? null,
      section_id: sectionId,
      section_name: sectionId
        ? pendingSectionNameById.get(sectionId) ?? "—"
        : "—",
      expires_at: payment?.expires_at ?? null,
      payment_status: payment?.status ?? null,
      owner_name: ownerProfileId
        ? pendingOwnerNameByProfileId.get(ownerProfileId) ?? null
        : null,
      owner_email: ownerProfileId
        ? pendingOwnerEmailByProfileId.get(ownerProfileId) ?? null
        : null,
      created_at: booking?.created_at ?? null,
    };
  });

  const adminReservedHolds = result.flatMap((section) =>
    section.seats.map((seat) => ({
      hold_source: "admin_reserved" as const,
      seat_id: seat.id,
      row_label: seat.row_label,
      seat_number: seat.seat_number,
      section_id: section.id,
      section_name: section.name,
    }))
  );

  return NextResponse.json({
    sections: result,
    active_cart_holds: activeCartHolds,
    pending_booking_holds: pendingBookingHolds,
    blocked_holds: [...activeCartHolds, ...pendingBookingHolds, ...adminReservedHolds],
  });
}
