import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import { generateOne } from "@/lib/print-tickets/generate";
import { cappedFreeStandingSlotCount } from "@/lib/print-tickets/free-standing-slot-cap";
import { isFreeStandingSeatingType } from "@/lib/print-tickets/is-free-standing-section";
import {
  getPrintTicketGenConcurrency,
  PRINT_GEN_SEQUENTIAL_UNDER,
  runPool,
} from "@/lib/print-tickets/run-pool";

export const dynamic = "force-dynamic";
/** Same as `LONG_PRINT_TICKETS_ROUTE_MAX_DURATION` — literal required by Next.js route config. */
export const maxDuration = 86400;

async function canManagePrintTickets() {
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

export async function POST(request: NextRequest) {
  try {
  if (!(await canManagePrintTickets())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = typeof (body as { eventId?: string }).eventId === "string" ? (body as { eventId: string }).eventId : null;
  const eventSectionId = typeof (body as { eventSectionId?: string }).eventSectionId === "string" ? (body as { eventSectionId: string }).eventSectionId : null;
  const eventSeatId =
    (body as { eventSeatId?: string | null }).eventSeatId === null ||
    (body as { eventSeatId?: string | null }).eventSeatId === undefined
      ? null
      : typeof (body as { eventSeatId?: string }).eventSeatId === "string"
        ? (body as { eventSeatId: string }).eventSeatId
        : null;

  const generateAllSeats = (body as { generateAllSeats?: boolean }).generateAllSeats === true;
  const rawSlot = (body as { sectionSlotIndex?: unknown }).sectionSlotIndex;
  const sectionSlotFromBody =
    typeof rawSlot === "number" && Number.isFinite(rawSlot) && rawSlot >= 1
      ? Math.floor(rawSlot)
      : undefined;

  if (!eventId || !eventSectionId) {
    return NextResponse.json(
      { error: "eventId and eventSectionId are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  if (generateAllSeats) {
    const { data: section } = await supabase
      .from("event_sections")
      .select("capacity, seating_type")
      .eq("id", eventSectionId)
      .single();

    const ids: string[] = [];

    /** Must match `expand-items`: free/standing uses slot rows even if legacy `event_seats` exist. */
    if (isFreeStandingSeatingType(section?.seating_type)) {
      const n = cappedFreeStandingSlotCount((section as { capacity?: number })?.capacity ?? 0);
      const slots = Array.from({ length: n }, (_, i) => i + 1);
      const conc =
        slots.length < PRINT_GEN_SEQUENTIAL_UNDER
          ? 1
          : getPrintTicketGenConcurrency();
      await runPool(slots, conc, async (slot) => {
        const result = await generateOne(supabase, eventId, eventSectionId, null, slot);
        if (result.ok) ids.push(result.id);
      });
    } else {
      const { data: seats } = await supabase
        .from("event_seats")
        .select("id")
        .eq("event_section_id", eventSectionId)
        .order("row_label")
        .order("seat_number");

      if (seats && seats.length > 0) {
        const conc =
          seats.length < PRINT_GEN_SEQUENTIAL_UNDER
            ? 1
            : getPrintTicketGenConcurrency();
        await runPool(seats, conc, async (seat) => {
          const result = await generateOne(supabase, eventId, eventSectionId, seat.id);
          if (result.ok) ids.push(result.id);
        });
      } else {
        return NextResponse.json({ generated: 0, ids: [] });
      }
    }

    return NextResponse.json({ generated: ids.length, ids });
  }

  const result = await generateOne(
    supabase,
    eventId,
    eventSectionId,
    eventSeatId,
    eventSeatId ? undefined : sectionSlotFromBody ?? 1
  );
  if (!result.ok) {
    console.error("[print-tickets/generate] generateOne failed:", result.message);
    return NextResponse.json({ error: result.message }, { status: 500 });
  }

  return NextResponse.json({ id: result.id, ticket_image_url: result.ticket_image_url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[print-tickets/generate] unhandled POST error:", msg, e);
    return NextResponse.json(
      { error: msg || "Internal server error" },
      { status: 500 }
    );
  }
}
















































