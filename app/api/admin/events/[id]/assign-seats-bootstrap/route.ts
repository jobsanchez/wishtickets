import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";

export const dynamic = "force-dynamic";

function slimAvailabilityPayload(raw: unknown): {
  seats: Array<{
    id: string;
    row_label: string | null;
    seat_number: string | null;
    section_id: string | null;
    available: boolean;
    status?: string;
  }>;
  sections: Array<{
    id: string;
    name: string;
    section_code?: string | null;
    section_group?: string | null;
    capacity: number;
    available: number;
    seating_type?: string;
    color?: string | null;
  }>;
} {
  const d = raw as Record<string, unknown>;
  const seatsRaw = Array.isArray(d.seats) ? d.seats : [];
  const sectionsRaw = Array.isArray(d.sections) ? d.sections : [];

  return {
    seats: seatsRaw.map((s) => {
      const row = s as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        row_label: (row.row_label as string | null) ?? null,
        seat_number: (row.seat_number as string | null) ?? null,
        section_id: (row.section_id as string | null) ?? null,
        available: Boolean(row.available),
        ...(typeof row.status === "string" ? { status: row.status } : {}),
      };
    }),
    sections: sectionsRaw.map((s) => {
      const row = s as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? ""),
        section_code: (row.section_code as string | null) ?? null,
        section_group: (row.section_group as string | null) ?? null,
        capacity: typeof row.capacity === "number" ? row.capacity : 0,
        available: typeof row.available === "number" ? row.available : 0,
        ...(typeof row.seating_type === "string"
          ? { seating_type: row.seating_type }
          : {}),
        color: (row.color as string | null) ?? null,
      };
    }),
  };
}

/**
 * Admin-only: same seat/section semantics as public availability, but strips canvases,
 * layout blobs, and per-seat grid fields so Manual Distribution loads a smaller JSON payload.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const denied = await forbiddenUnlessEventSection(eventId, "assign");
  if (denied) return denied;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_availability", {
    p_event_id: eventId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const payload = slimAvailabilityPayload(data);

  // Ensure section_group is available for manual-distribution grouping,
  // even when the availability RPC payload does not include it yet.
  const { data: sectionRows } = await supabase
    .from("event_sections")
    .select("id, section_group")
    .eq("event_id", eventId);

  const sectionGroupById = new Map<string, string | null>();
  for (const row of sectionRows ?? []) {
    sectionGroupById.set(row.id as string, (row.section_group as string | null) ?? null);
  }

  const sectionsWithGroup = payload.sections.map((section) => ({
    ...section,
    section_group: sectionGroupById.get(section.id) ?? section.section_group ?? null,
  }));

  return NextResponse.json({ ...payload, sections: sectionsWithGroup }, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
