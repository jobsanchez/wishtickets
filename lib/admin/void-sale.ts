import type { SupabaseClient } from "@supabase/supabase-js";
import { rotateEncryptedQrForSeatOnRelease } from "@/lib/event-seats/seat-encrypted-qr";

const DEFAULT_PRICE_CENTS = 50000;

export interface VoidSaleSummary {
  deleted_tickets: number;
  deleted_admissions: number;
  deleted_booking_promos: number;
  deleted_payments: number;
  reset_seats: number;
  deleted_bookings: number;
  updated_bookings: number;
}

export interface BookingCleanupResult {
  deleted_booking_promos: number;
  deleted_payments: number;
  deleted_bookings: number;
  reset_assignments: number;
}

export interface SoldTicketEntry {
  ticket_id: string;
  booking_id: string;
  seat_id: string | null;
  seat_label: string;
}

export interface SoldTicketSectionGroup {
  section_id: string;
  section_name: string;
  sold_count: number;
  sold_tickets: SoldTicketEntry[];
}

export interface SoldTicketGroup {
  group_key: string;
  group_label: string;
  sections: SoldTicketSectionGroup[];
}

type TicketRow = {
  id: string;
  booking_id: string;
  seat_id: string | null;
  section_id: string | null;
};

export async function cleanupBookingIfEmpty(
  admin: SupabaseClient,
  bookingId: string
): Promise<BookingCleanupResult> {
  const { count: remainingCount, error: countError } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if (countError) throw new Error(countError.message);
  if ((remainingCount ?? 0) > 0) {
    return {
      deleted_booking_promos: 0,
      deleted_payments: 0,
      deleted_bookings: 0,
      reset_assignments: 0,
    };
  }

  const { count: promoDeleteCount, error: promoDeleteErr } = await admin
    .from("booking_promo_codes")
    .delete({ count: "exact" })
    .eq("booking_id", bookingId);
  if (promoDeleteErr) throw new Error(promoDeleteErr.message);

  const { count: paymentsDeleteCount, error: paymentsDeleteErr } = await admin
    .from("payments")
    .delete({ count: "exact" })
    .eq("booking_id", bookingId);
  if (paymentsDeleteErr) throw new Error(paymentsDeleteErr.message);

  const { count: assignmentResetCount, error: assignmentResetErr } = await admin
    .from("admin_seat_assignments")
    .update({ status: "reserved", booking_id: null }, { count: "exact" })
    .eq("booking_id", bookingId);
  if (assignmentResetErr) throw new Error(assignmentResetErr.message);

  const { count: bookingDeleteCount, error: bookingDeleteErr } = await admin
    .from("bookings")
    .delete({ count: "exact" })
    .eq("id", bookingId);
  if (bookingDeleteErr) throw new Error(bookingDeleteErr.message);

  if ((bookingDeleteCount ?? 0) < 1) {
    const { data: bookingStill } = await admin
      .from("bookings")
      .select("id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingStill) {
      throw new Error(
        "Booking delete had no effect (row still exists with zero tickets). Check RLS policies for bookings, payments, and booking_promo_codes DELETE, or database permissions."
      );
    }
  }

  return {
    deleted_booking_promos: promoDeleteCount ?? 0,
    deleted_payments: paymentsDeleteCount ?? 0,
    deleted_bookings: bookingDeleteCount ?? 0,
    reset_assignments: assignmentResetCount ?? 0,
  };
}

function deriveGroupLabel(sectionName: string, sectionCode: string | null): string {
  const source = (sectionCode?.trim() || sectionName.trim()).toUpperCase();
  if (!source) return "UNGROUPED";
  const splitByDash = source.split("-")[0]?.trim();
  if (splitByDash) return splitByDash;
  const splitBySpace = source.split(/\s+/)[0]?.trim();
  return splitBySpace || source;
}

export async function resolveSectionForEvent(
  admin: SupabaseClient,
  eventId: string,
  sectionId?: string,
  sectionName?: string
): Promise<{ id: string; name: string } | null> {
  if (sectionId) {
    const { data } = await admin
      .from("event_sections")
      .select("id, name")
      .eq("id", sectionId)
      .eq("event_id", eventId)
      .maybeSingle();
    return data ?? null;
  }
  if (!sectionName) return null;
  const sectionNameNorm = sectionName.trim().toLowerCase();
  const { data: sectionRows } = await admin
    .from("event_sections")
    .select("id, name, section_code")
    .eq("event_id", eventId);
  const matched = (sectionRows ?? []).find((s) => {
    const name = (s.name ?? "").trim().toLowerCase();
    const code = (s.section_code ?? "").trim().toLowerCase();
    return name === sectionNameNorm || code === sectionNameNorm;
  });
  return matched ? { id: matched.id, name: matched.name ?? "Section" } : null;
}

export async function listSoldTicketGroups(
  admin: SupabaseClient,
  eventId: string
): Promise<SoldTicketGroup[]> {
  const { data: bookingRows, error: bookingsErr } = await admin
    .from("bookings")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (bookingsErr) throw new Error(bookingsErr.message);
  const bookingIds = (bookingRows ?? []).map((b) => b.id);
  if (bookingIds.length === 0) return [];

  const { data: ticketRows, error: ticketErr } = await admin
    .from("tickets")
    .select("id, booking_id, seat_id, section_id")
    .in("booking_id", bookingIds);
  if (ticketErr) throw new Error(ticketErr.message);
  if (!ticketRows || ticketRows.length === 0) return [];

  const seatIds = [...new Set(ticketRows.map((t) => t.seat_id).filter((id): id is string => !!id))];
  const sectionIds = [
    ...new Set(
      ticketRows
        .map((t) => t.section_id)
        .filter((id): id is string => !!id)
    ),
  ];

  const { data: seatRows, error: seatErr } =
    seatIds.length > 0
      ? await admin
          .from("event_seats")
          .select("id, row_label, seat_number, event_section_id, status")
          .in("id", seatIds)
      : { data: [], error: null };
  if (seatErr) throw new Error(seatErr.message);

  const extraSectionIdsFromSeats = [
    ...new Set((seatRows ?? []).map((s) => s.event_section_id).filter((id): id is string => !!id)),
  ];
  const allSectionIds = [...new Set([...sectionIds, ...extraSectionIdsFromSeats])];

  const { data: sectionRows, error: sectionErr } =
    allSectionIds.length > 0
      ? await admin
          .from("event_sections")
          .select("id, name, section_code, sort_order")
          .in("id", allSectionIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };
  if (sectionErr) throw new Error(sectionErr.message);

  const seatById = new Map((seatRows ?? []).map((s) => [s.id, s]));
  const sectionById = new Map((sectionRows ?? []).map((s) => [s.id, s]));

  const groups = new Map<
    string,
    {
      group_key: string;
      group_label: string;
      sections: Map<
        string,
        {
          section_id: string;
          section_name: string;
          sold_count: number;
          sold_tickets: Array<{
            ticket_id: string;
            booking_id: string;
            seat_id: string | null;
            seat_label: string;
          }>;
        }
      >;
    }
  >();

  for (const t of ticketRows) {
    const seat = t.seat_id ? seatById.get(t.seat_id) : null;
    if (seat && seat.status !== "sold") continue;
    const sectionId = t.section_id ?? seat?.event_section_id ?? null;
    if (!sectionId) continue;
    const section = sectionById.get(sectionId);
    const sectionName = section?.name ?? section?.section_code ?? "Section";
    const groupLabel = deriveGroupLabel(sectionName, section?.section_code ?? null);
    const groupKey = groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_");

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group_key: groupKey,
        group_label: groupLabel,
        sections: new Map(),
      });
    }
    const group = groups.get(groupKey)!;
    if (!group.sections.has(sectionId)) {
      group.sections.set(sectionId, {
        section_id: sectionId,
        section_name: sectionName,
        sold_count: 0,
        sold_tickets: [],
      });
    }
    const sectionGroup = group.sections.get(sectionId)!;
    const seatLabel = seat
      ? `Row ${seat.row_label ?? "-"} Seat ${seat.seat_number ?? "-"}`
      : `Open seat ${t.id.slice(0, 8)}`;
    sectionGroup.sold_tickets.push({
      ticket_id: t.id,
      booking_id: t.booking_id,
      seat_id: t.seat_id,
      seat_label: seatLabel,
    });
    sectionGroup.sold_count += 1;
  }

  return Array.from(groups.values())
    .map((g) => ({
      group_key: g.group_key,
      group_label: g.group_label,
      sections: Array.from(g.sections.values()).sort((a, b) =>
        a.section_name.localeCompare(b.section_name)
      ),
    }))
    .sort((a, b) => a.group_label.localeCompare(b.group_label));
}

export async function listSoldTicketGroupsForBooking(
  admin: SupabaseClient,
  eventId: string,
  bookingId: string
): Promise<SoldTicketGroup[]> {
  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, event_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);
  if (!booking || booking.event_id !== eventId || booking.status !== "confirmed") return [];

  const { data: ticketRows, error: ticketErr } = await admin
    .from("tickets")
    .select("id, booking_id, seat_id, section_id")
    .eq("booking_id", bookingId);
  if (ticketErr) throw new Error(ticketErr.message);
  if (!ticketRows || ticketRows.length === 0) return [];

  const seatIds = [...new Set(ticketRows.map((t) => t.seat_id).filter((id): id is string => !!id))];
  const sectionIds = [
    ...new Set(ticketRows.map((t) => t.section_id).filter((id): id is string => !!id)),
  ];

  const { data: seatRows, error: seatErr } =
    seatIds.length > 0
      ? await admin
          .from("event_seats")
          .select("id, row_label, seat_number, event_section_id, status")
          .in("id", seatIds)
      : { data: [], error: null };
  if (seatErr) throw new Error(seatErr.message);

  const extraSectionIdsFromSeats = [
    ...new Set((seatRows ?? []).map((s) => s.event_section_id).filter((id): id is string => !!id)),
  ];
  const allSectionIds = [...new Set([...sectionIds, ...extraSectionIdsFromSeats])];

  const { data: sectionRows, error: sectionErr } =
    allSectionIds.length > 0
      ? await admin
          .from("event_sections")
          .select("id, name, section_code, sort_order")
          .in("id", allSectionIds)
          .order("sort_order", { ascending: true })
      : { data: [], error: null };
  if (sectionErr) throw new Error(sectionErr.message);

  const seatById = new Map((seatRows ?? []).map((s) => [s.id, s]));
  const sectionById = new Map((sectionRows ?? []).map((s) => [s.id, s]));

  const groups = new Map<
    string,
    {
      group_key: string;
      group_label: string;
      sections: Map<string, SoldTicketSectionGroup>;
    }
  >();

  for (const t of ticketRows) {
    const seat = t.seat_id ? seatById.get(t.seat_id) : null;
    if (seat && seat.status !== "sold") continue;
    const sectionId = t.section_id ?? seat?.event_section_id ?? null;
    if (!sectionId) continue;
    const section = sectionById.get(sectionId);
    const sectionName = section?.name ?? section?.section_code ?? "Section";
    const groupLabel = deriveGroupLabel(sectionName, section?.section_code ?? null);
    const groupKey = groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_");

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group_key: groupKey,
        group_label: groupLabel,
        sections: new Map(),
      });
    }
    const group = groups.get(groupKey)!;
    if (!group.sections.has(sectionId)) {
      group.sections.set(sectionId, {
        section_id: sectionId,
        section_name: sectionName,
        sold_count: 0,
        sold_tickets: [],
      });
    }
    const sectionGroup = group.sections.get(sectionId)!;
    const seatLabel = seat
      ? `Row ${seat.row_label ?? "-"} Seat ${seat.seat_number ?? "-"}`
      : `Open seat ${t.id.slice(0, 8)}`;
    sectionGroup.sold_tickets.push({
      ticket_id: t.id,
      booking_id: t.booking_id,
      seat_id: t.seat_id,
      seat_label: seatLabel,
    });
    sectionGroup.sold_count += 1;
  }

  return Array.from(groups.values())
    .map((g) => ({
      group_key: g.group_key,
      group_label: g.group_label,
      sections: Array.from(g.sections.values()).sort((a, b) =>
        a.section_name.localeCompare(b.section_name)
      ),
    }))
    .sort((a, b) => a.group_label.localeCompare(b.group_label));
}

export async function releaseSoldTicketsForAssignmentBooking(
  admin: SupabaseClient,
  eventId: string,
  bookingId: string,
  ticketIds: string[]
): Promise<VoidSaleSummary> {
  const uniqueTicketIds = [...new Set(ticketIds)];
  if (uniqueTicketIds.length === 0) {
    return {
      deleted_tickets: 0,
      deleted_admissions: 0,
      deleted_booking_promos: 0,
      deleted_payments: 0,
      reset_seats: 0,
      deleted_bookings: 0,
      updated_bookings: 0,
    };
  }

  const { data: booking, error: bookingErr } = await admin
    .from("bookings")
    .select("id, event_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);
  if (!booking || booking.event_id !== eventId || booking.status !== "confirmed") {
    throw new Error("Booking not found or not confirmed for event");
  }

  const { data: assignment, error: assignmentErr } = await admin
    .from("admin_seat_assignments")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (assignmentErr) throw new Error(assignmentErr.message);

  const { data: allTickets, error: ticketErr } = await admin
    .from("tickets")
    .select("id, booking_id, seat_id, section_id")
    .eq("booking_id", bookingId)
    .in("id", uniqueTicketIds);
  if (ticketErr) throw new Error(ticketErr.message);
  const selectedTickets = (allTickets ?? []) as TicketRow[];
  if (selectedTickets.length !== uniqueTicketIds.length) {
    throw new Error("Some selected tickets are invalid for this assignment booking");
  }

  const seatIdsToRelease = selectedTickets
    .map((t) => t.seat_id)
    .filter((id): id is string => !!id);

  const { count: admissionsCount, error: admissionsErr } = await admin
    .from("admission_records")
    .delete({ count: "exact" })
    .in("ticket_id", uniqueTicketIds);
  if (admissionsErr) throw new Error(admissionsErr.message);

  const { count: deletedTicketsCount, error: ticketDeleteErr } = await admin
    .from("tickets")
    .delete({ count: "exact" })
    .in("id", uniqueTicketIds)
    .eq("booking_id", bookingId);
  if (ticketDeleteErr) throw new Error(ticketDeleteErr.message);

  if (seatIdsToRelease.length > 0) {
    const nextSeatState = assignment
      ? { status: "reserved", assignment_id: assignment.id }
      : { status: "available", assignment_id: null };
    const { error: seatUpdateErr } = await admin
      .from("event_seats")
      .update(nextSeatState)
      .in("id", seatIdsToRelease);
    if (seatUpdateErr) throw new Error(seatUpdateErr.message);
  }

  const { data: remainingTickets, error: remainingErr } = await admin
    .from("tickets")
    .select("id, seat_id, section_id, quantity")
    .eq("booking_id", bookingId);
  if (remainingErr) throw new Error(remainingErr.message);

  if (!remainingTickets || remainingTickets.length === 0) {
    const cleanup = await cleanupBookingIfEmpty(admin, bookingId);

    return {
      deleted_tickets: deletedTicketsCount ?? uniqueTicketIds.length,
      deleted_admissions: admissionsCount ?? 0,
      deleted_booking_promos: cleanup.deleted_booking_promos,
      deleted_payments: cleanup.deleted_payments,
      reset_seats: seatIdsToRelease.length,
      deleted_bookings: cleanup.deleted_bookings,
      updated_bookings: 0,
    };
  }

  const { data: priceRows, error: priceErr } = await admin
    .from("event_prices")
    .select("section_id, price_cents")
    .eq("event_id", eventId);
  if (priceErr) throw new Error(priceErr.message);
  const priceMap = new Map<string, number>();
  for (const row of priceRows ?? []) priceMap.set(row.section_id, row.price_cents);

  const remainingSeatIds = remainingTickets
    .map((t) => t.seat_id)
    .filter((id): id is string => !!id);
  const seatSectionMap = new Map<string, string>();
  if (remainingSeatIds.length > 0) {
    const { data: remainingSeatRows, error: seatLookupErr } = await admin
      .from("event_seats")
      .select("id, event_section_id")
      .in("id", remainingSeatIds);
    if (seatLookupErr) throw new Error(seatLookupErr.message);
    for (const row of remainingSeatRows ?? []) {
      if (row.event_section_id) seatSectionMap.set(row.id, row.event_section_id);
    }
  }

  let recomputedTotal = 0;
  for (const t of remainingTickets) {
    if (t.seat_id) {
      const sid = seatSectionMap.get(t.seat_id);
      recomputedTotal += sid ? priceMap.get(sid) ?? DEFAULT_PRICE_CENTS : DEFAULT_PRICE_CENTS;
    } else if (t.section_id) {
      recomputedTotal += (priceMap.get(t.section_id) ?? DEFAULT_PRICE_CENTS) * (t.quantity ?? 1);
    }
  }

  const { count: promoDeleteCount, error: promoDeleteErr } = await admin
    .from("booking_promo_codes")
    .delete({ count: "exact" })
    .eq("booking_id", bookingId);
  if (promoDeleteErr) throw new Error(promoDeleteErr.message);

  const { error: bookingUpdateErr } = await admin
    .from("bookings")
    .update({
      total_cents: Math.max(0, recomputedTotal),
      discount_cents: 0,
      promo_code_id: null,
    })
    .eq("id", bookingId);
  if (bookingUpdateErr) throw new Error(bookingUpdateErr.message);

  return {
    deleted_tickets: deletedTicketsCount ?? uniqueTicketIds.length,
    deleted_admissions: admissionsCount ?? 0,
    deleted_booking_promos: promoDeleteCount ?? 0,
    deleted_payments: 0,
    reset_seats: seatIdsToRelease.length,
    deleted_bookings: 0,
    updated_bookings: 1,
  };
}

export async function voidSoldTickets(
  admin: SupabaseClient,
  eventId: string,
  ticketIds: string[]
): Promise<VoidSaleSummary> {
  const uniqueTicketIds = [...new Set(ticketIds)];
  if (uniqueTicketIds.length === 0) {
    return {
      deleted_tickets: 0,
      deleted_admissions: 0,
      deleted_booking_promos: 0,
      deleted_payments: 0,
      reset_seats: 0,
      deleted_bookings: 0,
      updated_bookings: 0,
    };
  }

  const { data: allTickets, error: ticketLoadErr } = await admin
    .from("tickets")
    .select("id, booking_id, seat_id, section_id")
    .in("id", uniqueTicketIds);
  if (ticketLoadErr) throw new Error(ticketLoadErr.message);
  const tickets = (allTickets ?? []) as TicketRow[];
  if (tickets.length === 0) {
    return {
      deleted_tickets: 0,
      deleted_admissions: 0,
      deleted_booking_promos: 0,
      deleted_payments: 0,
      reset_seats: 0,
      deleted_bookings: 0,
      updated_bookings: 0,
    };
  }

  const bookingIds = [...new Set(tickets.map((t) => t.booking_id))];
  const soldSeatIds = tickets.map((t) => t.seat_id).filter((id): id is string => !!id);

  const { data: bookings, error: bookingsErr } = await admin
    .from("bookings")
    .select("id, event_id")
    .in("id", bookingIds);
  if (bookingsErr) throw new Error(bookingsErr.message);
  if ((bookings ?? []).some((b) => b.event_id !== eventId)) {
    throw new Error("Refused: attempted cross-event reset");
  }

  const { count: admissionsCount, error: admissionsErr } = await admin
    .from("admission_records")
    .delete({ count: "exact" })
    .in("ticket_id", tickets.map((t) => t.id));
  if (admissionsErr) throw new Error(admissionsErr.message);

  const { count: bookingPromoCount, error: bookingPromoErr } = await admin
    .from("booking_promo_codes")
    .delete({ count: "exact" })
    .in("booking_id", bookingIds);
  if (bookingPromoErr) throw new Error(bookingPromoErr.message);

  const { count: paymentsCount, error: paymentsErr } = await admin
    .from("payments")
    .delete({ count: "exact" })
    .in("booking_id", bookingIds);
  if (paymentsErr) throw new Error(paymentsErr.message);

  if (soldSeatIds.length > 0) {
    const { error: seatResetErr } = await admin
      .from("event_seats")
      .update({ status: "available", assignment_id: null })
      .in("id", soldSeatIds);
    if (seatResetErr) throw new Error(seatResetErr.message);
  }

  const { count: deletedTicketsCount, error: ticketDeleteErr } = await admin
    .from("tickets")
    .delete({ count: "exact" })
    .in("id", tickets.map((t) => t.id));
  if (ticketDeleteErr) throw new Error(ticketDeleteErr.message);

  const seatIdsToRotate = [...new Set(soldSeatIds)];
  if (seatIdsToRotate.length > 0) {
    await Promise.all(
      seatIdsToRotate.map((seatId) => rotateEncryptedQrForSeatOnRelease(admin, seatId))
    );
  }

  const { data: priceRows, error: priceErr } = await admin
    .from("event_prices")
    .select("section_id, price_cents")
    .eq("event_id", eventId);
  if (priceErr) throw new Error(priceErr.message);
  const priceMap = new Map<string, number>();
  for (const row of priceRows ?? []) priceMap.set(row.section_id, row.price_cents);

  let deletedBookingsCount = 0;
  let updatedBookingsCount = 0;
  for (const bookingId of bookingIds) {
    const { data: remainingTickets, error: remainingErr } = await admin
      .from("tickets")
      .select("id, seat_id, section_id, quantity")
      .eq("booking_id", bookingId);
    if (remainingErr) throw new Error(remainingErr.message);

    if (!remainingTickets || remainingTickets.length === 0) {
      const { count: delCount, error: bookingDeleteErr } = await admin
        .from("bookings")
        .delete({ count: "exact" })
        .eq("id", bookingId);
      if (bookingDeleteErr) throw new Error(bookingDeleteErr.message);
      if ((delCount ?? 0) < 1) {
        const { data: bookingStill } = await admin
          .from("bookings")
          .select("id")
          .eq("id", bookingId)
          .maybeSingle();
        if (bookingStill) {
          throw new Error(
            "Booking delete had no effect after voiding tickets. Check RLS policies for bookings DELETE."
          );
        }
      } else {
        deletedBookingsCount += 1;
      }
      continue;
    }

    const remainingSeatIds = remainingTickets
      .map((t) => t.seat_id)
      .filter((id): id is string => !!id);
    const seatSectionMap = new Map<string, string>();
    if (remainingSeatIds.length > 0) {
      const { data: remainingSeatRows, error: seatLookupErr } = await admin
        .from("event_seats")
        .select("id, event_section_id")
        .in("id", remainingSeatIds);
      if (seatLookupErr) throw new Error(seatLookupErr.message);
      for (const row of remainingSeatRows ?? []) {
        if (row.event_section_id) seatSectionMap.set(row.id, row.event_section_id);
      }
    }

    let recomputedTotal = 0;
    for (const t of remainingTickets) {
      if (t.seat_id) {
        const sid = seatSectionMap.get(t.seat_id);
        recomputedTotal += sid ? priceMap.get(sid) ?? DEFAULT_PRICE_CENTS : DEFAULT_PRICE_CENTS;
      } else if (t.section_id) {
        recomputedTotal += (priceMap.get(t.section_id) ?? DEFAULT_PRICE_CENTS) * (t.quantity ?? 1);
      }
    }

    const { error: bookingUpdateErr } = await admin
      .from("bookings")
      .update({
        total_cents: Math.max(0, recomputedTotal),
        discount_cents: 0,
        promo_code_id: null,
      })
      .eq("id", bookingId);
    if (bookingUpdateErr) throw new Error(bookingUpdateErr.message);
    updatedBookingsCount += 1;
  }

  return {
    deleted_tickets: deletedTicketsCount ?? tickets.length,
    deleted_admissions: admissionsCount ?? 0,
    deleted_booking_promos: bookingPromoCount ?? 0,
    deleted_payments: paymentsCount ?? 0,
    reset_seats: soldSeatIds.length,
    deleted_bookings: deletedBookingsCount,
    updated_bookings: updatedBookingsCount,
  };
}
