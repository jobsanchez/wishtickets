import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";

const MAX_POSITIONS_PER_REQUEST = 15_000;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

function clampGridCoord(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n);
  return Math.max(INT32_MIN, Math.min(INT32_MAX, r));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const denied = await forbiddenUnlessAnyEventSection(id, ["seating", "selector"]);
    if (denied) return denied;

    let body: { positions: Array<{ seatId: string; grid_x: number; grid_y: number }> } = {
      positions: [],
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const positions = body.positions;
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: "positions array required" }, { status: 400 });
    }

    if (positions.length > MAX_POSITIONS_PER_REQUEST) {
      return NextResponse.json(
        { error: `At most ${MAX_POSITIONS_PER_REQUEST} seat positions per request` },
        { status: 400 }
      );
    }

    for (const p of positions) {
      if (!p.seatId || typeof p.grid_x !== "number" || typeof p.grid_y !== "number") {
        return NextResponse.json(
          { error: "Each position must have seatId, grid_x, grid_y" },
          { status: 400 }
        );
      }
    }

    const bySeatId = new Map<string, { seatId: string; grid_x: number; grid_y: number }>();
    for (const p of positions) {
      bySeatId.set(p.seatId, {
        seatId: p.seatId,
        grid_x: clampGridCoord(p.grid_x),
        grid_y: clampGridCoord(p.grid_y),
      });
    }
    const payload = [...bySeatId.values()];

    const supabase = await createClient();
    const { data: updatedRaw, error } = await supabase.rpc("admin_patch_event_seat_positions", {
      p_event_id: id,
      p_positions: payload,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg === "Forbidden" || msg.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        msg.includes("admin_patch_event_seat_positions") ||
        (msg.toLowerCase().includes("function") && msg.toLowerCase().includes("does not exist"))
      ) {
        return NextResponse.json(
          {
            error:
              "Seat position bulk-save is not available on this database yet. Apply migration 00155_admin_patch_event_seat_positions.sql (e.g. npm run db:push), then retry.",
          },
          { status: 503 }
        );
      }
      if (
        msg.includes("positions must") ||
        msg.includes("positions array") ||
        msg.includes("at most 15000") ||
        msg.includes("event id required")
      ) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const updated = typeof updatedRaw === "number" ? updatedRaw : Number(updatedRaw ?? 0);
    return NextResponse.json({ success: true, updated: Number.isFinite(updated) ? updated : 0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal server error";
    console.error("[PATCH seating/positions]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
