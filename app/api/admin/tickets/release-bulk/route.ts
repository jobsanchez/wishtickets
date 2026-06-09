import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { cleanupBookingIfEmpty } from "@/lib/admin/void-sale";

async function canRelease() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

const DEFAULT_PRICE_CENTS = 50000;

export async function POST(request: NextRequest) {
  if (!(await canRelease())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ticketIds = Array.isArray(body.ticket_ids)
    ? (body.ticket_ids as string[]).filter((id): id is string => typeof id === "string")
    : [];

  if (ticketIds.length === 0) {
    return NextResponse.json(
      { error: "ticket_ids array is required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: tickets, error: ticketError } = await supabase
    .from("tickets")
    .select("id, booking_id, seat_id, section_id, quantity")
    .in("id", ticketIds);

  if (ticketError || !tickets || tickets.length === 0) {
    return NextResponse.json({ error: "No valid tickets found" }, { status: 404 });
  }

  const bookingIds = [...new Set(tickets.map((t) => t.booking_id))];
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, status, event_id")
    .in("id", bookingIds);

  const bookingMap = new Map(bookings?.map((b) => [b.id, b]) ?? []);
  const eventIds = new Set(bookings?.map((b) => b.event_id).filter(Boolean) ?? []);

  if (eventIds.size > 1) {
    return NextResponse.json(
      { error: "All tickets must belong to the same event" },
      { status: 400 }
    );
  }

  const invalid = tickets.filter((t) => {
    const b = bookingMap.get(t.booking_id);
    return !b || b.status !== "confirmed";
  });
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "All tickets must belong to confirmed bookings" },
      { status: 400 }
    );
  }

  const eventId = [...eventIds][0];
  if (!eventId) {
    return NextResponse.json({ error: "Event not found" }, { status: 400 });
  }

  let releasedCount = 0;
  for (const ticket of tickets) {
    const { data: assignment } = await supabase
      .from("admin_seat_assignments")
      .select("id")
      .eq("booking_id", ticket.booking_id)
      .single();

    const { error: deleteError } = await supabase
      .from("tickets")
      .delete()
      .eq("id", ticket.id);

    if (deleteError) {
      return NextResponse.json(
        {
          success: false,
          released_count: releasedCount,
          error: deleteError.message ?? "Failed to delete ticket",
        },
        { status: 500 }
      );
    }
    releasedCount++;

    if (ticket.seat_id) {
      if (assignment) {
        await supabase
          .from("event_seats")
          .update({ status: "reserved", assignment_id: assignment.id })
          .eq("id", ticket.seat_id);
      } else {
        await supabase
          .from("event_seats")
          .update({ status: "available", assignment_id: null })
          .eq("id", ticket.seat_id);
      }
    }

    const { data: remainingTickets } = await supabase
      .from("tickets")
      .select("id, seat_id, section_id, quantity")
      .eq("booking_id", ticket.booking_id);

    if (!remainingTickets || remainingTickets.length === 0) {
      try {
        await cleanupBookingIfEmpty(supabase, ticket.booking_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to clean up booking";
        return NextResponse.json(
          {
            success: false,
            released_count: releasedCount,
            error: message,
          },
          { status: 500 }
        );
      }
    } else {
      const { data: eventPrices } = await supabase
        .from("event_prices")
        .select("section_id, price_cents")
        .eq("event_id", eventId);
      const priceMap = new Map<string, number>();
      for (const p of eventPrices ?? []) {
        priceMap.set(p.section_id, p.price_cents);
      }

      const { data: seatRows } = await supabase
        .from("event_seats")
        .select("id, event_section_id")
        .in(
          "id",
          remainingTickets
            .filter((t) => t.seat_id)
            .map((t) => t.seat_id as string)
        );

      let newTotal = 0;
      for (const t of remainingTickets) {
        if (t.seat_id) {
          const seat = seatRows?.find((s) => s.id === t.seat_id);
          const sectionId = seat?.event_section_id ?? null;
          newTotal += sectionId
            ? (priceMap.get(sectionId) ?? DEFAULT_PRICE_CENTS)
            : DEFAULT_PRICE_CENTS;
        } else if (t.section_id && t.quantity) {
          newTotal +=
            (priceMap.get(t.section_id) ?? DEFAULT_PRICE_CENTS) * t.quantity;
        }
      }
      if (newTotal === 0) {
        newTotal = DEFAULT_PRICE_CENTS * remainingTickets.length;
      }

      await supabase
        .from("bookings")
        .update({ total_cents: newTotal })
        .eq("id", ticket.booking_id);
    }
  }

  // Final reconciliation pass to avoid stale booking/report rows after mixed releases.
  for (const bookingId of bookingIds) {
    try {
      await cleanupBookingIfEmpty(supabase, bookingId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clean up booking";
      return NextResponse.json(
        {
          success: false,
          released_count: releasedCount,
          error: message,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, released_count: releasedCount });
}
