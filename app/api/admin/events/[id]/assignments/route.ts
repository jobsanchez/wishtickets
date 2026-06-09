import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";

export const dynamic = "force-dynamic";

/** PostgREST returns 400 Bad Request when `.in()` lists are too large for a single request. */
const IN_CHUNK_SIZE = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function chunkIds<T>(ids: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

function isLikelyUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessEventSection(id, "assign");
  if (denied) return denied;

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data, error } = await supabase.rpc("get_admin_seat_assignments", {
    p_event_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const assignments = (data ?? []) as Array<{
    booking_id: string | null;
    items?: Array<{ seat_id?: string | null; quantity?: number | null }> | null;
  }>;

  const bookingIds = [
    ...new Set(
      assignments
        .map((a) => a.booking_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    ),
  ];

  const bookingStats = new Map<string, { expected: number; generated: number }>();
  const bookingSectionIds = new Map<string, Set<string>>();
  if (bookingIds.length > 0) {
    for (const bookingId of bookingIds) {
      const [{ count: expectedCount, error: expectedErr }, { count: generatedCount, error: generatedErr }] =
        await Promise.all([
          admin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", bookingId),
          admin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("booking_id", bookingId)
            .not("ticket_image_url", "is", null),
        ]);
      if (expectedErr || generatedErr) {
        return NextResponse.json(
          { error: expectedErr?.message ?? generatedErr?.message ?? "Failed to count booking tickets" },
          { status: 500 }
        );
      }
      bookingStats.set(bookingId, {
        expected: typeof expectedCount === "number" ? expectedCount : 0,
        generated: typeof generatedCount === "number" ? generatedCount : 0,
      });
    }

    const ticketRows: Array<{
      booking_id: string | null;
      section_id?: string | null;
      seat_id?: string | null;
      ticket_image_url?: string | null;
    }> = [];
    for (const idChunk of chunkIds(bookingIds, IN_CHUNK_SIZE)) {
      const { data: chunkRows, error: ticketErr } = await admin
        .from("tickets")
        .select("booking_id, section_id, seat_id, ticket_image_url")
        .in("booking_id", idChunk);
      if (ticketErr) {
        return NextResponse.json({ error: ticketErr.message }, { status: 500 });
      }
      for (const r of chunkRows ?? []) {
        ticketRows.push(
          r as {
            booking_id: string | null;
            section_id?: string | null;
            seat_id?: string | null;
            ticket_image_url?: string | null;
          }
        );
      }
    }

    const seatIds = [
      ...new Set(
        ticketRows
          .map((r) => r.seat_id ?? null)
          .filter(
            (v): v is string =>
              typeof v === "string" && v.length > 0 && isLikelyUuid(v)
          )
      ),
    ];
    const seatSectionById = new Map<string, string>();
    if (seatIds.length > 0) {
      for (const idChunk of chunkIds(seatIds, IN_CHUNK_SIZE)) {
        const { data: seatRows, error: seatErr } = await admin
          .from("event_seats")
          .select("id, event_section_id")
          .in("id", idChunk);
        if (seatErr) {
          return NextResponse.json({ error: seatErr.message }, { status: 500 });
        }
        for (const row of (seatRows ?? []) as Array<{
          id?: string;
          event_section_id?: string | null;
        }>) {
          if (row.id && row.event_section_id) seatSectionById.set(row.id, row.event_section_id);
        }
      }
    }
    for (const row of ticketRows) {
      const bookingId = row.booking_id;
      if (!bookingId) continue;

      const secId = row.section_id ?? (row.seat_id ? seatSectionById.get(row.seat_id) : undefined);
      if (secId) {
        const set = bookingSectionIds.get(bookingId) ?? new Set<string>();
        set.add(secId);
        bookingSectionIds.set(bookingId, set);
      }
    }
  }

  const enriched = assignments.map((a) => {
    const bookingId = a.booking_id;
    const expectedFromItems =
      a.items?.reduce(
        (sum, item) => sum + (item?.seat_id ? 1 : Math.max(1, item?.quantity ?? 1)),
        0
      ) ?? 0;
    const booking = bookingId ? bookingStats.get(bookingId) : undefined;
    return {
      ...a,
      expected_tickets: booking?.expected ?? expectedFromItems,
      generated_ticket_images: booking?.generated ?? 0,
      section_ids: bookingId ? [...(bookingSectionIds.get(bookingId) ?? new Set<string>())] : [],
    };
  });

  return NextResponse.json(enriched);
}
