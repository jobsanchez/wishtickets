import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole } from "@/lib/auth";
import { z } from "zod";

const deleteSchema = z.object({
  event_id: z.string().uuid(),
  ticket_ids: z.array(z.string().uuid()).optional(),
  event_section_id: z.string().uuid().optional(),
  section_name: z.string().optional(),
  delete_all: z.boolean().optional(),
}).refine(
  (d) => (d.ticket_ids?.length ?? 0) > 0 || d.event_section_id || d.section_name || d.delete_all,
  { message: "Provide ticket_ids, event_section_id, section_name, or delete_all" }
);

export async function POST(request: NextRequest) {
  const role = await getProfileRole();
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors?.[0] ?? "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { event_id, ticket_ids, event_section_id, section_name, delete_all } = parsed.data;
  const admin = createAdminClient();

  let targetTicketIds: string[] = [];

  if (delete_all) {
    const { data: records } = await admin
      .from("admission_records")
      .select("ticket_id")
      .eq("event_id", event_id)
      .eq("action", "admit");
    const seen = new Set<string>();
    for (const r of records ?? []) {
      if (r.ticket_id) seen.add(r.ticket_id);
    }
    targetTicketIds = Array.from(seen);
  } else if (section_name) {
    const { data: records } = await admin
      .from("admission_records")
      .select("ticket_id, section_label")
      .eq("event_id", event_id)
      .eq("action", "admit");
    const sn = section_name.trim().toLowerCase();
    for (const r of records ?? []) {
      const label = (r.section_label ?? "").trim().toLowerCase();
      if (label === sn) {
        targetTicketIds.push(r.ticket_id);
      }
    }
  } else if (event_section_id) {
    const { data: admittedRecords } = await admin
      .from("admission_records")
      .select("ticket_id")
      .eq("event_id", event_id)
      .eq("action", "admit");
    const ticketIdsFromRecords = [...new Set((admittedRecords ?? []).map((r) => r.ticket_id))];
    if (ticketIdsFromRecords.length === 0) {
      return NextResponse.json({ deleted_count: 0 });
    }
    const { data: eventSeats } = await admin
      .from("event_seats")
      .select("id")
      .eq("event_section_id", event_section_id);
    const seatIdsInSection = new Set((eventSeats ?? []).map((s) => s.id));
    const { data: tickets } = await admin
      .from("tickets")
      .select("id, seat_id, section_id")
      .in("id", ticketIdsFromRecords);
    for (const t of tickets ?? []) {
      if (t.seat_id && seatIdsInSection.has(t.seat_id)) {
        targetTicketIds.push(t.id);
      } else if (t.section_id === event_section_id) {
        targetTicketIds.push(t.id);
      }
    }
  } else if (ticket_ids && ticket_ids.length > 0) {
    const { data: tickets } = await admin
      .from("tickets")
      .select("id, booking_id")
      .in("id", ticket_ids);
    const bookingIds = [...new Set((tickets ?? []).map((t) => t.booking_id))];
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, event_id")
      .in("id", bookingIds);
    const eventMatch = (bookings ?? []).every((b) => b.event_id === event_id);
    if (!eventMatch || (bookings ?? []).length === 0) {
      return NextResponse.json({ error: "Tickets not found or not for this event" }, { status: 400 });
    }
    targetTicketIds = ticket_ids;
  }

  if (targetTicketIds.length === 0) {
    return NextResponse.json({ deleted_count: 0 });
  }

  await admin.from("admission_records").delete().in("ticket_id", targetTicketIds);
  const { error: updateErr } = await admin
    .from("tickets")
    .update({ admitted_at: null, re_entry_allowed: false })
    .in("id", targetTicketIds);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ deleted_count: targetTicketIds.length });
}
