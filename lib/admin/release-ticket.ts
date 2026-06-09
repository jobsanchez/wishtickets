import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupBookingIfEmpty } from "@/lib/admin/void-sale";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearInventoryAllocationForTicket } from "@/lib/ticket-inventory";

const DEFAULT_PRICE_CENTS = 50000;

export class ReleaseTicketError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "ReleaseTicketError";
    this.status = status;
  }
}

type ReleaseTicketOptions = {
  forceSeatAvailable?: boolean;
  clearManualDistributionSeat?: boolean;
};

export async function releaseConfirmedTicket(
  supabase: SupabaseClient,
  ticketId: string,
  options: ReleaseTicketOptions = {}
): Promise<{ seatStatus: "available" | "reserved" }> {
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, booking_id, seat_id, section_id, quantity")
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) {
    throw new ReleaseTicketError("Ticket not found", 404);
  }

  const { data: booking, error: bookError } = await supabase
    .from("bookings")
    .select("id, status, event_id")
    .eq("id", ticket.booking_id)
    .single();

  if (bookError || !booking) {
    throw new ReleaseTicketError("Booking not found", 404);
  }

  if (booking.status !== "confirmed") {
    throw new ReleaseTicketError(
      "Only tickets from confirmed bookings can be released",
      400
    );
  }

  const { data: assignments } = await supabase
    .from("admin_seat_assignments")
    .select("id")
    .eq("booking_id", ticket.booking_id);
  const assignmentIds = (assignments ?? []).map((row) => row.id);

  // Fail closed: do not delete the tickets row if inventory deallocation fails.
  // (FK ON DELETE SET NULL would eventually clear print_tickets, but a silent
  // failure here hides operational errors from admins.)
  try {
    const admin = createAdminClient();
    await clearInventoryAllocationForTicket(admin, ticketId);
  } catch (e) {
    console.error("[release-ticket] clear inventory allocation failed:", {
      ticketId,
      error: e,
    });
    const msg =
      e instanceof Error ? e.message : "Failed to clear ticket inventory allocation";
    throw new ReleaseTicketError(msg, 500);
  }

  const { error: deleteError } = await supabase
    .from("tickets")
    .delete()
    .eq("id", ticketId);

  if (deleteError) {
    throw new ReleaseTicketError(
      deleteError.message ?? "Failed to delete ticket",
      500
    );
  }

  let seatStatus: "available" | "reserved" = "available";
  if (ticket.seat_id) {
    if (options.clearManualDistributionSeat === true && assignmentIds.length > 0) {
      await supabase
        .from("admin_assignment_items")
        .delete()
        .in("assignment_id", assignmentIds)
        .eq("seat_id", ticket.seat_id);

      await supabase
        .from("event_seats")
        .update({ status: "available", assignment_id: null })
        .eq("id", ticket.seat_id);

      for (const assignmentId of assignmentIds) {
        const [{ count: seatCount }, { count: itemCount }] = await Promise.all([
          supabase
            .from("event_seats")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignmentId),
          supabase
            .from("admin_assignment_items")
            .select("id", { count: "exact", head: true })
            .eq("assignment_id", assignmentId),
        ]);

        if ((seatCount ?? 0) === 0 && (itemCount ?? 0) === 0) {
          await supabase
            .from("admin_seat_assignments")
            .delete()
            .eq("id", assignmentId);
        }
      }

      seatStatus = "available";
    } else if (options.forceSeatAvailable === true) {
      seatStatus = "available";
      await supabase
        .from("event_seats")
        .update({ status: "available", assignment_id: null })
        .eq("id", ticket.seat_id);
    } else if (assignmentIds.length > 0) {
      seatStatus = "reserved";
      await supabase
        .from("event_seats")
        .update({ status: "reserved", assignment_id: assignmentIds[0] })
        .eq("id", ticket.seat_id);
    } else {
      seatStatus = "available";
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
    await cleanupBookingIfEmpty(supabase, ticket.booking_id);
  } else {
    const { data: eventPrices } = await supabase
      .from("event_prices")
      .select("section_id, price_cents")
      .eq("event_id", booking.event_id);
    const priceMap = new Map<string, number>();
    for (const p of eventPrices ?? []) {
      priceMap.set(p.section_id, p.price_cents);
    }

    const { data: seatRows } = await supabase
      .from("event_seats")
      .select("id, event_section_id")
      .in(
        "id",
        remainingTickets.filter((t) => t.seat_id).map((t) => t.seat_id!)
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

  await cleanupBookingIfEmpty(supabase, ticket.booking_id);

  return { seatStatus };
}

