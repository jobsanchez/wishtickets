import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import {
  resolveSectionForEvent,
  voidSoldTickets,
  type VoidSaleSummary,
} from "@/lib/admin/void-sale";

const payloadSchema = z
  .object({
    event_id: z.string().uuid(),
    section_id: z.string().trim().min(1).optional(),
    section_name: z.string().trim().min(1).optional(),
  })
  .refine((v) => !!v.section_id || !!v.section_name, {
    message: "section_id or section_name is required",
  });

export async function POST(request: NextRequest) {
  if (!(await requireSuperAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    const msg = parsed.error.flatten().formErrors[0] ?? "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { event_id: eventId } = parsed.data;
  const admin = createAdminClient();

  const section = await resolveSectionForEvent(
    admin,
    eventId,
    parsed.data.section_id,
    parsed.data.section_name
  );
  if (!section) {
    return NextResponse.json({ error: "Section not found for event" }, { status: 404 });
  }
  const { data: sectionSeatRows, error: sectionSeatErr } = await admin
    .from("event_seats")
    .select("id")
    .eq("event_id", eventId)
    .eq("event_section_id", section.id);
  if (sectionSeatErr) {
    return NextResponse.json({ error: sectionSeatErr.message }, { status: 500 });
  }
  const sectionSeatIds = (sectionSeatRows ?? []).map((r) => r.id);

  const ticketQuery = admin
    .from("tickets")
    .select("id, section_id, seat_id");
  const { data: ticketRows, error: ticketErr } =
    sectionSeatIds.length > 0
      ? await ticketQuery.or(`section_id.eq.${section.id},seat_id.in.(${sectionSeatIds.join(",")})`)
      : await ticketQuery.eq("section_id", section.id);
  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message }, { status: 500 });
  }
  const selectedTicketIds = (ticketRows ?? []).map((t) => t.id);
  let summary: VoidSaleSummary;
  try {
    summary = await voidSoldTickets(admin, eventId, selectedTicketIds);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear sold section" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    event_id: eventId,
    section_id: section.id,
    section_name: section.name ?? "Section",
    deleted_tickets: summary.deleted_tickets,
    deleted_admissions: summary.deleted_admissions,
    deleted_booking_promos: summary.deleted_booking_promos,
    deleted_payments: summary.deleted_payments,
    reset_seats: summary.reset_seats,
    deleted_bookings: summary.deleted_bookings,
    updated_bookings: summary.updated_bookings,
  });
}
