import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { chunkArray } from "@/lib/array-chunks";

/** PostgREST returns 400 "Bad Request" when `.in()` lists are too large for one request (URL/query limits). */
const IN_CHUNK_SIZE = 100;

const sectionAssignmentSchema = z.object({
  section_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const assignSchema = z
  .object({
    recipient_name: z.string().min(1, "Recipient name is required"),
    recipient_email: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
      "Invalid email"
    ),
    distribution_category: z.enum(["sales", "complementary"]).optional().default("sales"),
    seat_ids: z.array(z.string().uuid()).optional().default([]),
    section_assignments: z.array(sectionAssignmentSchema).optional().default([]),
  })
  .refine(
    (data) =>
      data.seat_ids!.length > 0 ||
      data.section_assignments!.some((a) => a.quantity > 0),
    { message: "Provide at least one seat or section quantity" }
  );

async function releaseSeatsChunks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  seatIds: string[],
  eventId: string
): Promise<void> {
  for (const chunk of chunkArray(seatIds, IN_CHUNK_SIZE)) {
    await supabase
      .from("event_seats")
      .update({ status: "available", assignment_id: null })
      .in("id", chunk)
      .eq("event_id", eventId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "assign");
  if (denied) return denied;

  const body = await request.json();
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { recipient_name, recipient_email, distribution_category, seat_ids, section_assignments } = parsed.data;
  const sectionItems = (section_assignments ?? []).filter((a) => a.quantity > 0);
  const emailToSave =
    typeof recipient_email === "string" && recipient_email.trim()
      ? recipient_email.trim()
      : null;

  const supabase = await createClient();
  const userId = await getCurrentUserId();

  if (sectionItems.length > 0) {
    const { data: availability } = await supabase.rpc("get_event_availability", {
      p_event_id: eventId,
    });
    const sectionMap = new Map<
      string,
      { available: number; name?: string }
    >();
    for (const s of availability?.sections ?? []) {
      sectionMap.set(s.id, { available: s.available ?? 0, name: s.name });
    }
    const qtyBySection = new Map<string, number>();
    for (const item of sectionItems) {
      qtyBySection.set(
        item.section_id,
        (qtyBySection.get(item.section_id) ?? 0) + item.quantity
      );
    }
    for (const [sectionId, totalQty] of qtyBySection) {
      const sec = sectionMap.get(sectionId);
      if (!sec || sec.available < totalQty) {
        return NextResponse.json(
          {
            error: `Section ${sec?.name ?? sectionId} has only ${sec?.available ?? 0} available`,
          },
          { status: 400 }
        );
      }
    }
  }

  const { data: assignment, error: assignError } = await supabase
    .from("admin_seat_assignments")
    .insert({
      event_id: eventId,
      recipient_name,
      recipient_email: emailToSave,
      distribution_category: distribution_category,
      status: "reserved",
      created_by: userId,
    })
    .select("id")
    .single();

  if (assignError || !assignment) {
    return NextResponse.json(
      { error: assignError?.message ?? "Failed to create manual distribution" },
      { status: 500 }
    );
  }

  if ((seat_ids ?? []).length > 0) {
    const ids = seat_ids!;
    let reservedSucceeded: string[] = [];
    for (const chunk of chunkArray(ids, IN_CHUNK_SIZE)) {
      const { error: updateError } = await supabase
        .from("event_seats")
        .update({ status: "reserved", assignment_id: assignment.id })
        .in("id", chunk)
        .eq("event_id", eventId);

      if (updateError) {
        if (reservedSucceeded.length > 0) {
          await releaseSeatsChunks(supabase, reservedSucceeded, eventId);
        }
        await supabase.from("admin_seat_assignments").delete().eq("id", assignment.id);
        return NextResponse.json(
          { error: updateError.message ?? "Failed to mark seats as reserved" },
          { status: 500 }
        );
      }
      reservedSucceeded = reservedSucceeded.concat(chunk);
    }
  }

  if (sectionItems.length > 0) {
    const allocatedSeatIds: string[] = [];
    const { data: bookingIds } = await supabase
      .from("bookings")
      .select("id")
      .eq("event_id", eventId)
      .eq("status", "confirmed");
    const bidList = (bookingIds ?? []).map((b) => b.id);

    let bookedSeatIds: string[] = [];
    if (bidList.length > 0) {
      for (const bidChunk of chunkArray(bidList, IN_CHUNK_SIZE)) {
        const { data: tk } = await supabase
          .from("tickets")
          .select("seat_id")
          .in("booking_id", bidChunk)
          .not("seat_id", "is", null);
        bookedSeatIds = bookedSeatIds.concat((tk ?? []).map((t) => t.seat_id as string));
      }
    }

    const { data: activeCarts } = await supabase
      .from("reservation_carts")
      .select("id")
      .eq("event_id", eventId)
      .gt("expires_at", new Date().toISOString());
    let reservedSeatIds: string[] = [];
    if ((activeCarts ?? []).length > 0) {
      const cartIds = (activeCarts ?? []).map((c) => c.id);
      for (const cartChunk of chunkArray(cartIds, IN_CHUNK_SIZE)) {
        const { data: ri } = await supabase
          .from("reservation_items")
          .select("seat_id")
          .in("cart_id", cartChunk)
          .not("seat_id", "is", null);
        reservedSeatIds = reservedSeatIds.concat((ri ?? []).map((r) => r.seat_id as string));
      }
    }

    const { data: alreadyReserved } = await supabase
      .from("event_seats")
      .select("id")
      .eq("event_id", eventId)
      .or("assignment_id.not.is.null,status.eq.reserved,status.eq.hold,status.eq.sold");
    const reservedIds = new Set([
      ...bookedSeatIds,
      ...reservedSeatIds,
      ...(alreadyReserved ?? []).map((s) => s.id),
    ]);

    for (const item of sectionItems) {
      const { data: avail } = await supabase
        .from("event_seats")
        .select("id")
        .eq("event_id", eventId)
        .eq("event_section_id", item.section_id)
        .order("row_label")
        .order("seat_number")
        .limit(item.quantity + 50);

      const usable = (avail ?? [])
        .filter((s) => !reservedIds.has(s.id))
        .slice(0, item.quantity);

      if (usable.length < item.quantity) {
        if (allocatedSeatIds.length > 0) {
          await releaseSeatsChunks(supabase, allocatedSeatIds, eventId);
        }
        await supabase.from("admin_seat_assignments").delete().eq("id", assignment.id);
        return NextResponse.json(
          {
            error: `Section has only ${usable.length} available (requested ${item.quantity})`,
          },
          { status: 400 }
        );
      }

      for (const s of usable) {
        reservedIds.add(s.id);
        allocatedSeatIds.push(s.id);
      }
    }

    const seatIdsReservedInThisStep: string[] = [];
    for (const seatChunk of chunkArray(allocatedSeatIds, IN_CHUNK_SIZE)) {
      const { error: updateErr } = await supabase
        .from("event_seats")
        .update({ status: "reserved", assignment_id: assignment.id })
        .in("id", seatChunk)
        .eq("event_id", eventId);

      if (updateErr) {
        await releaseSeatsChunks(supabase, seatIdsReservedInThisStep, eventId);
        await supabase.from("admin_seat_assignments").delete().eq("id", assignment.id);
        return NextResponse.json(
          { error: updateErr.message ?? "Failed to reserve seats" },
          { status: 500 }
        );
      }
      seatIdsReservedInThisStep.push(...seatChunk);
    }

    let assignmentItemsInsertError: string | null = null;
    for (const rowsChunk of chunkArray(
      allocatedSeatIds.map((seat_id) => ({
        assignment_id: assignment.id,
        seat_id,
        section_id: null,
        quantity: 1,
      })),
      IN_CHUNK_SIZE
    )) {
      const { error: itemsError } = await supabase.from("admin_assignment_items").insert(rowsChunk);
      if (itemsError) {
        assignmentItemsInsertError = itemsError.message;
        break;
      }
    }

    if (assignmentItemsInsertError) {
      await releaseSeatsChunks(supabase, allocatedSeatIds, eventId);
      await supabase.from("admin_seat_assignments").delete().eq("id", assignment.id);
      return NextResponse.json(
        {
          error: assignmentItemsInsertError ?? "Failed to create manual distribution items",
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(assignment);
}
