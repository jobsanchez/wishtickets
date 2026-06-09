import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import {
  listSoldTicketGroups,
  resolveSectionForEvent,
  voidSoldTickets,
} from "@/lib/admin/void-sale";

const postSchema = z
  .object({
    ticket_id: z.string().uuid().optional(),
    section_id: z.string().uuid().optional(),
    group_key: z.string().trim().min(1).optional(),
    section_name: z.string().trim().min(1).optional(),
  })
  .refine(
    (v) =>
      Number(Boolean(v.ticket_id)) +
        Number(Boolean(v.section_id || v.section_name)) +
        Number(Boolean(v.group_key)) ===
      1,
    {
      message: "Provide exactly one target: ticket_id, section_id/section_name, or group_key",
    }
  );

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: eventId } = await params;
  const admin = createAdminClient();
  try {
    const groups = await listSoldTicketGroups(admin, eventId);
    return NextResponse.json({ event_id: eventId, groups });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load sold inventory" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: eventId } = await params;
  const admin = createAdminClient();

  const payloadRaw = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const payload = parsed.data;
  let ticketIds: string[] = [];

  if (payload.ticket_id) {
    const { data: ticketRow, error: ticketErr } = await admin
      .from("tickets")
      .select("id, booking_id")
      .eq("id", payload.ticket_id)
      .maybeSingle();
    if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });
    if (!ticketRow) return NextResponse.json({ error: "Sold ticket not found" }, { status: 404 });

    const { data: booking, error: bookingErr } = await admin
      .from("bookings")
      .select("event_id")
      .eq("id", ticketRow.booking_id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking || booking.event_id !== eventId) {
      return NextResponse.json({ error: "Ticket does not belong to this event" }, { status: 400 });
    }

    ticketIds = [payload.ticket_id];
  } else if (payload.section_id || payload.section_name) {
    const section = await resolveSectionForEvent(
      admin,
      eventId,
      payload.section_id,
      payload.section_name
    );
    if (!section) {
      return NextResponse.json({ error: "Section not found for event" }, { status: 404 });
    }
    const groups = await listSoldTicketGroups(admin, eventId);
    ticketIds = groups
      .flatMap((g) => g.sections)
      .filter((s) => s.section_id === section.id)
      .flatMap((s) => s.sold_tickets.map((t) => t.ticket_id));
  } else if (payload.group_key) {
    const groups = await listSoldTicketGroups(admin, eventId);
    const group = groups.find((g) => g.group_key === payload.group_key);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    ticketIds = group.sections.flatMap((s) => s.sold_tickets.map((t) => t.ticket_id));
  }

  try {
    const summary = await voidSoldTickets(admin, eventId, ticketIds);
    return NextResponse.json({
      success: true,
      event_id: eventId,
      ...summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to void sold seats" },
      { status: 500 }
    );
  }
}
