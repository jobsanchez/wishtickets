import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { deterministicEncryptedQrForNewSeat } from "@/lib/event-seats/seat-encrypted-qr";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generateScanCode(): string {
  const bytes = crypto.randomBytes(4);
  let s = "";
  for (let i = 0; i < 4; i++) {
    s += CHARS[bytes[i]! % 36];
  }
  return s;
}


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
  if (denied) return denied;

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("venue_id")
    .eq("id", id)
    .single();

  if (!event?.venue_id) {
    return NextResponse.json({ error: "Event has no venue" }, { status: 400 });
  }

  const { data: venueSections } = await supabase
    .from("sections")
    .select("id, name, capacity")
    .eq("venue_id", event.venue_id)
    .order("name");

  const { data: venueSeats } = await supabase
    .from("seats")
    .select("id, section_id, row_label, seat_number")
    .eq("venue_id", event.venue_id);

  if (!venueSections?.length && !venueSeats?.length) {
    return NextResponse.json({
      error: "Venue has no sections or seats to copy",
      sections: [],
      seats: [],
    }, { status: 400 });
  }

  const sectionIdMap = new Map<string, string>();
  const eventSectionCodeById = new Map<string, string>();

  if (venueSections?.length) {
    for (let i = 0; i < venueSections.length; i++) {
      const vs = venueSections[i];
      const { data: newSec, error: secErr } = await supabase
        .from("event_sections")
        .insert({
          event_id: id,
          name: vs.name,
          section_code: vs.name,
          capacity: 0,
          sort_order: i,
        })
        .select("id")
        .single();
      if (secErr) {
        return NextResponse.json({ error: secErr.message }, { status: 500 });
      }
      if (newSec) {
        sectionIdMap.set(vs.id, newSec.id);
        eventSectionCodeById.set(newSec.id, vs.name);
      }
    }
  }

  if (venueSeats?.length) {
    const { data: existingSeats } = await supabase
      .from("event_seats")
      .select("scan_code")
      .eq("event_id", id);
    const usedCodes = new Set((existingSeats ?? []).map((s) => s.scan_code));
    const firstEventSectionId = sectionIdMap.size > 0 ? [...sectionIdMap.values()][0] : null;
    const { data: evRow } = await supabase.from("events").select("event_code").eq("id", id).single();
    const eventCode = (evRow?.event_code ?? "").trim() || "XXX";

    const seatRows = venueSeats
      .map((vs) => {
        const newSectionId = vs.section_id
          ? sectionIdMap.get(vs.section_id)
          : firstEventSectionId;
        if (!newSectionId) return null;
        let code = generateScanCode();
        while (usedCodes.has(code)) {
          code = generateScanCode();
        }
        usedCodes.add(code);
        const rowLabel = vs.row_label ?? "";
        const seatNumber = String(vs.seat_number ?? "");
        const sectionCode = eventSectionCodeById.get(newSectionId) ?? "000";
        return {
          event_id: id,
          event_section_id: newSectionId,
          row_label: rowLabel,
          seat_number: seatNumber,
          scan_code: code,
          encrypted_qr: deterministicEncryptedQrForNewSeat({
            eventCode,
            sectionCode,
            rowLabel,
            seatNumber,
          }),
        };
      })
      .filter(Boolean) as Array<{
        event_id: string;
        event_section_id: string;
        row_label: string;
        seat_number: string;
        scan_code: string;
        encrypted_qr: string;
      }>;

    if (seatRows.length > 0) {
      const { error: seatsErr } = await supabase.from("event_seats").insert(seatRows);
      if (seatsErr) {
        return NextResponse.json({ error: seatsErr.message }, { status: 500 });
      }

      const seatCountBySection = seatRows.reduce<Record<string, number>>((acc, s) => {
        acc[s.event_section_id] = (acc[s.event_section_id] ?? 0) + 1;
        return acc;
      }, {});
      for (const [eventSectionId, count] of Object.entries(seatCountBySection)) {
        await supabase
          .from("event_sections")
          .update({ capacity: count })
          .eq("id", eventSectionId)
          .eq("event_id", id);
      }
    }
  }

  return NextResponse.json({ success: true });
}
