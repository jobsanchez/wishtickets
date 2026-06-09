import { getAdminClientIfAvailable } from "@/lib/supabase/admin";
import { createPublicAnonClient } from "@/lib/supabase/public-anon";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

/** Anon-only path must not be treated as fully static — otherwise CDN may cache an empty/stale JSON body. */
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
} as const;
const EVENT_SEAT_REPAIR_COOLDOWN_MS = 60_000;
const lastSeatRepairAtByEvent = new Map<string, number>();

function withAvailabilityDebugHeaders(
  branch: string,
  requestId: string
): Record<string, string> {
  return {
    ...NO_STORE,
    "x-availability-branch": branch,
    "x-availability-request-id": requestId,
  };
}

/**
 * Netlify runs App Router API routes inside sync serverless Lambdas (~10s default wall-clock).
 * The book page aborts availability `fetch()` at 12s per phase (manifest vs seats split).
 *
 * Override in Netlify UI: `NETLIFY_AVAILABILITY_RPC_TIMEOUT_MS` (milliseconds). To force detection:
 * set `NETLIFY=1`.
 */
function isNetlifyServerlessRuntime(): boolean {
  return (
    process.env.NETLIFY === "true" ||
    process.env.NETLIFY === "1" ||
    (typeof process.env.SITE_ID === "string" && process.env.SITE_ID.length >= 20)
  );
}

function getAvailabilityRpcTimeoutMs(): number {
  const raw = process.env.NETLIFY_AVAILABILITY_RPC_TIMEOUT_MS;
  if (raw !== undefined && /^\d+$/.test(raw.trim())) {
    return Math.min(120_000, Math.max(1_000, Number(raw.trim())));
  }
  if (isNetlifyServerlessRuntime()) {
    return 9_500;
  }
  return 18_000;
}

class AvailabilityRpcTimeoutError extends Error {
  constructor() {
    super("AVAILABILITY_RPC_TIMEOUT");
    this.name = "AvailabilityRpcTimeoutError";
  }
}

function clientForAvailabilityRpc() {
  return (
    getAdminClientIfAvailable() ??
    createPublicAnonClient() ??
    null
  );
}

async function raceRpc<TResult>(
  supabase: SupabaseClient,
  fn: PromiseLike<{ data: TResult; error: { message: string } | null }>
): Promise<{ data: TResult; error: { message: string } | null }> {
  const timeoutMs = getAvailabilityRpcTimeoutMs();
  return await Promise.race([
    fn,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new AvailabilityRpcTimeoutError()), timeoutMs);
    }),
  ]);
}

function getArrayField(payload: unknown, key: string): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const value = (payload as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nullAvailabilityResponse(eventId: string): Promise<NextResponse> {
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[api/events/availability] availability RPC returned null for",
      eventId,
      "- Draft events need migration 00208. With SUPABASE_SERVICE_ROLE_KEY set, this API returns a specific error body."
    );
  }
  const admin = getAdminClientIfAvailable();
  if (admin) {
    const { data: ev } = await admin
      .from("events")
      .select("id, status, venue_id")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) {
      return NextResponse.json({ error: "Event not found" }, { status: 404, headers: NO_STORE });
    }
    const { count: sectionCount } = await admin
      .from("event_sections")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);
    const hasSections = (sectionCount ?? 0) > 0;
    const seatingConfigured = !!ev.venue_id || hasSections;
    if (!seatingConfigured) {
      return NextResponse.json(
        {
          error:
            "This event has no seating configuration yet. Add a venue or create event sections and seats in admin.",
          code: "no_seating",
        },
        { status: 404, headers: NO_STORE }
      );
    }
    if (ev.status === "draft") {
      return NextResponse.json(
        {
          error:
            "Draft seat maps require database migration 00208 (get_event_availability for draft and published). Apply it in the Supabase SQL Editor or run `supabase db push`.",
          code: "draft_availability_requires_migration",
        },
        { status: 503, headers: NO_STORE }
      );
    }
  }
  return NextResponse.json({ error: "Event not found" }, { status: 404, headers: NO_STORE });
}

async function repairEventSeatEventIdDrift(eventId: string): Promise<void> {
  const admin = getAdminClientIfAvailable();
  if (!admin) return;
  const now = Date.now();
  const last = lastSeatRepairAtByEvent.get(eventId) ?? 0;
  if (now - last < EVENT_SEAT_REPAIR_COOLDOWN_MS) return;
  lastSeatRepairAtByEvent.set(eventId, now);

  const { data: sections, error: sectionErr } = await admin
    .from("event_sections")
    .select("id")
    .eq("event_id", eventId);
  if (sectionErr) return;
  const sectionIds = (sections ?? []).map((s) => s.id).filter(Boolean);
  if (sectionIds.length === 0) return;

  const { data: driftSeats, error: driftErr } = await admin
    .from("event_seats")
    .select("id")
    .in("event_section_id", sectionIds)
    .neq("event_id", eventId)
    .limit(5000);
  if (driftErr) return;
  const seatIds = (driftSeats ?? []).map((s) => s.id).filter(Boolean);
  if (seatIds.length === 0) return;

  const { error: updateErr } = await admin
    .from("event_seats")
    .update({ event_id: eventId })
    .in("id", seatIds);
  if (!updateErr) {
    console.warn("[api/events/availability] repaired event_seats event_id drift", {
      eventId,
      repaired: seatIds.length,
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId =
    request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  const { id: eventId } = await params;
  const mode = request.nextUrl.searchParams.get("mode");
  const sectionIdsParam = request.nextUrl.searchParams.get("sectionIds");
  /** When absent or empty-string, load all seats (RPC receives NULL → full scan). */
  const parsedSectionIds =
    typeof sectionIdsParam === "string" && sectionIdsParam.trim().length > 0
      ? sectionIdsParam
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : null;
  const t0 = Date.now();
  try {
    await repairEventSeatEventIdDrift(eventId);
    const supabase = clientForAvailabilityRpc() ?? (await createClient());

    let data: unknown;
    let error: { message: string } | null;
    try {
      let result: {
        data: unknown;
        error: { message: string } | null;
      };

      if (mode === "manifest") {
        result = await raceRpc(
          supabase,
          supabase.rpc("get_event_availability_manifest", {
            p_event_id: eventId,
          })
        );
      } else if (mode === "seats") {
        result = await raceRpc(
          supabase,
          supabase.rpc("get_event_availability_seats", {
            p_event_id: eventId,
            /** Supabase/postgrest expects null key omitted or null for “all”; empty array ⇒ all seats in RPC. */
            p_section_ids: parsedSectionIds && parsedSectionIds.length > 0 ? parsedSectionIds : null,
          })
        );
      } else if (mode != null && mode !== "" && mode !== "full") {
        return NextResponse.json(
          { error: `Unknown availability mode "${mode}". Use manifest, seats, or omit.` },
          {
            status: 400,
            headers: withAvailabilityDebugHeaders("invalid_mode", requestId),
          }
        );
      } else {
        result = await raceRpc(
          supabase,
          supabase.rpc("get_event_availability", {
            p_event_id: eventId,
          })
        );
      }

      data = result.data;
      error = result.error;

      // Safety fallback: if split mode returns unexpectedly empty payloads while event is configured,
      // retry with full availability RPC (a few short attempts) for consistency.
      const fetchFullAvailabilityWithRetry = async () => {
        let fullData: unknown = null;
        let fullError: { message: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const full = await raceRpc(
            supabase,
            supabase.rpc("get_event_availability", { p_event_id: eventId })
          );
          fullData = full.data;
          fullError = full.error;
          if (fullError || !fullData) {
            if (attempt < 2) await sleep(180 + attempt * 220);
            continue;
          }
          const fullSections = getArrayField(fullData, "sections");
          const fullSeats = getArrayField(fullData, "seats");
          if (fullSections.length > 0 || fullSeats.length > 0) {
            return { data: fullData, error: fullError };
          }
          if (attempt < 2) await sleep(180 + attempt * 220);
        }
        return { data: fullData, error: fullError };
      };

      if (!error && data && mode === "manifest") {
        const sections = getArrayField(data, "sections");
        if (sections.length === 0) {
          const full = await fetchFullAvailabilityWithRetry();
          if (!full.error && full.data) {
            const fullSections = getArrayField(full.data, "sections");
            if (fullSections.length > 0) {
              data = {
                sections: fullSections,
                canvases: getArrayField(full.data, "canvases"),
              };
            }
          }
        }
        const finalSections = getArrayField(data, "sections");
        if (finalSections.length === 0) {
          // Never emit an empty manifest payload; it is ambiguous with "no configuration" and causes
          // false "No seat map configured" UI states during transient backend races.
          return NextResponse.json(
            {
              error:
                "Seat map is temporarily unavailable. Please retry; avoiding empty manifest payload.",
              code: "availability_manifest_transient_empty",
            },
            {
              status: 503,
              headers: withAvailabilityDebugHeaders(
                "manifest_transient_empty",
                requestId
              ),
            }
          );
        }
      }

      if (!error && data && mode === "seats") {
        const seats = getArrayField(data, "seats");
        if (seats.length === 0) {
          const full = await fetchFullAvailabilityWithRetry();
          if (!full.error && full.data) {
            const fullSeats = getArrayField(full.data, "seats");
            if (fullSeats.length > 0) {
              data = { seats: fullSeats };
            }
          }
        }
        const finalSeats = getArrayField(data, "seats");
        if (finalSeats.length === 0) {
          const assignedSectionIds =
            parsedSectionIds && parsedSectionIds.length > 0
              ? parsedSectionIds
              : (
                  await supabase
                    .from("event_sections")
                    .select("id")
                    .eq("event_id", eventId)
                    .in("seating_type", ["assigned"])
                ).data?.map((s) => s.id) ?? [];
          if (assignedSectionIds.length > 0) {
            const { count: configuredSeatCount } = await supabase
              .from("event_seats")
              .select("*", { count: "exact", head: true })
              .eq("event_id", eventId)
              .in("event_section_id", assignedSectionIds);
            if ((configuredSeatCount ?? 0) > 0) {
              return NextResponse.json(
                {
                  error:
                    "Seat availability is temporarily unavailable. Please retry; avoiding empty seats payload.",
                  code: "availability_seats_transient_empty",
                },
                {
                  status: 503,
                  headers: withAvailabilityDebugHeaders(
                    "seats_transient_empty",
                    requestId
                  ),
                }
              );
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof AvailabilityRpcTimeoutError) {
        return NextResponse.json(
          {
            error: "Seat availability took too long. Please try again.",
            code: "availability_timeout",
          },
          {
            status: 504,
            headers: withAvailabilityDebugHeaders("rpc_timeout", requestId),
          }
        );
      }
      throw e;
    }

    if (process.env.NODE_ENV === "development") {
      const ms = Date.now() - t0;
      if (!error && data) {
        console.info("[api/events/availability] ok", { eventId, mode: mode ?? "full", ms });
      }
    }

    if (error) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 500,
          headers: withAvailabilityDebugHeaders("rpc_error", requestId),
        }
      );
    }

    if (!data) {
      return nullAvailabilityResponse(eventId);
    }

    return NextResponse.json(data, {
      headers: withAvailabilityDebugHeaders(
        mode === "manifest"
          ? "manifest_ok"
          : mode === "seats"
            ? "seats_ok"
            : "full_ok",
        requestId
      ),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch availability";
    console.error("[api/events/availability] error:", e);
    return NextResponse.json(
      { error: msg, details: process.env.NODE_ENV === "development" ? String(e) : undefined },
      {
        status: 500,
        headers: withAvailabilityDebugHeaders("handler_error", requestId),
      }
    );
  }
}
