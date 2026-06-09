import { createClient } from "@/lib/supabase/server";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
});

const SEAT_CHUNK_SIZE = 1500;
/** ~30M seats at default batch — guard against infinite loops if RPC misbehaves. */
const MAX_SEAT_CHUNK_ITERATIONS = 20_000;

function isDuplicatePhase1Payload(
  v: unknown
): v is { job_id: string; target_event_id: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.job_id === "string" && typeof o.target_event_id === "string";
}

function isSeatChunkPayload(
  v: unknown
): v is { copied: number; done: boolean } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.copied === "number" && typeof o.done === "boolean";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceEventId } = await params;

  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const denied = await forbiddenUnlessEventSection(sourceEventId, "details");
  if (denied) return denied;

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors.title?.join(", ")
      ?? parsed.error.flatten().formErrors.join("; ")
      ?? "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const title = parsed.data.title.trim();

  const supabase = await createClient();

  const { data: phase1, error: phase1Error } =
    await supabase.rpc("duplicate_admin_event_phase1", {
      p_source_id: sourceEventId,
      p_new_title: title,
    });

  if (phase1Error) {
    const msg = phase1Error.message ?? "Duplicate failed";
    if (/forbidden/i.test(msg) || /not\s+found/i.test(msg)) {
      const status =
        msg.toLowerCase().includes("not found") ? 404 : 403;
      return NextResponse.json({ error: msg }, { status });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (!isDuplicatePhase1Payload(phase1)) {
    return NextResponse.json(
      { error: "Duplicate phase 1 returned an unexpected payload" },
      { status: 500 }
    );
  }

  const { job_id: jobId, target_event_id: newEventId } = phase1;

  let chunksDone = false;
  for (let i = 0; i < MAX_SEAT_CHUNK_ITERATIONS; i++) {
    const { data: chunk, error: chunkError } =
      await supabase.rpc("duplicate_admin_event_seats_chunk", {
        p_job_id: jobId,
        p_batch_size: SEAT_CHUNK_SIZE,
      });

    if (chunkError) {
      const msg = chunkError.message ?? "Seat copy failed";
      if (/forbidden/i.test(msg) || /not\s+found/i.test(msg)) {
        const status =
          msg.toLowerCase().includes("not found") ? 404 : 403;
        return NextResponse.json({ error: msg }, { status });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!isSeatChunkPayload(chunk)) {
      return NextResponse.json(
        { error: "Seat chunk returned an unexpected payload" },
        { status: 500 }
      );
    }

    if (chunk.done) {
      chunksDone = true;
      break;
    }
  }

  if (!chunksDone) {
    return NextResponse.json(
      {
        error:
          "Seat duplication stopped after exceeding the iteration safety limit — job may still be incomplete",
      },
      { status: 500 }
    );
  }

  try {
    await supabase.rpc("assign_event_admin", { p_event_id: newEventId });
  } catch {
    // Same as POST /api/admin/events: best-effort
  }

  return NextResponse.json({ id: newEventId });
}
