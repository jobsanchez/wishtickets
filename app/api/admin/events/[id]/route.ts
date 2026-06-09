import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { forbiddenUnlessEventSection } from "@/lib/require-event-section";
import { parseEventStartInput } from "@/lib/event-datetime";
import { z } from "zod";

const urlOrEmpty = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v),
  z
    .union([
      z.string().url(),
      z.string().regex(/^storage:\/\/[a-z0-9._-]+\/.+$/i),
      z.string().regex(/^\/storage\/v1\/object\/public\/.+$/i),
      z.null(),
    ])
    .optional()
);

function normalizeTeaserVideoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/storage/v1/object/public/")) {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
    return base ? `${base}${trimmed}` : null;
  }
  if (trimmed.startsWith("storage://")) {
    const withoutScheme = trimmed.slice("storage://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash <= 0) return null;
    const bucket = withoutScheme.slice(0, slash);
    const objectPath = withoutScheme.slice(slash + 1);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
    return base ? `${base}/storage/v1/object/public/${bucket}/${objectPath}` : null;
  }
  return null;
}

const eventSchema = z
  .object({
    title: z.string().min(1),
    slug: z.string().min(1),
    description: z.string().optional(),
    category: z.string(),
    status: z.enum(["draft", "published", "postponed", "archived"]).optional(),
    image_url: urlOrEmpty,
    thumbnail_url: urlOrEmpty,
    teaser_video_url: urlOrEmpty,
    event_start: z.string().min(1),
    venue_to_be_announced: z.boolean().optional().default(false),
    schedule_to_be_announced: z.boolean().optional().default(false),
    venue_id: z.preprocess(
      (v) => {
        if (v == null || v === "") return null;
        const s = String(v).trim().replace(/^\{|\}$/g, "");
        return s === "" ? null : s;
      },
      z.union([z.string().uuid(), z.null()])
    ),
    producer_id: z.preprocess(
      (v) => {
        if (v == null) return v;
        const s = String(v).trim();
        return s || v;
      },
      z.string().uuid()
    ),
    cart_time_duration_minutes: z.coerce.number().int().min(1).max(120).optional(),
    ticket_purchase_per_user: z.coerce.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.venue_to_be_announced && !data.venue_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "venue_id is required unless venue is To be announced",
        path: ["venue_id"],
      });
    }
  });

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_admin_event_by_id", {
    p_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const denied = await forbiddenUnlessEventSection(id, "details");
    if (denied) return denied;

    const body = await request.json();
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const msg =
        flat.fieldErrors &&
        Object.keys(flat.fieldErrors).length > 0
          ? Object.entries(flat.fieldErrors)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join("; ")
          : flat.formErrors?.join("; ") ?? "Invalid payload";
      return NextResponse.json(
        { error: msg, details: flat },
        { status: 400 }
      );
    }

    let normalizedEventStart: string;
    try {
      normalizedEventStart = parseEventStartInput(parsed.data.event_start).toISOString();
    } catch {
      return NextResponse.json(
        { error: "Invalid event_start. Please provide a valid date/time." },
        { status: 400 }
      );
    }

    const normalizedTeaserVideoUrl = normalizeTeaserVideoUrl(parsed.data.teaser_video_url ?? null);

    const rpcPayload: Record<string, unknown> = {
      p_id: id,
      p_title: parsed.data.title,
      p_slug: parsed.data.slug,
      p_description: parsed.data.description ?? "",
      p_category: parsed.data.category,
      p_status: parsed.data.status ?? "draft",
      p_image_url: parsed.data.image_url ?? null,
      p_thumbnail_url: parsed.data.thumbnail_url ?? null,
      p_teaser_video_url: normalizedTeaserVideoUrl,
      p_event_start: normalizedEventStart,
      p_venue_id: parsed.data.venue_to_be_announced ? null : parsed.data.venue_id,
      p_cart_time_duration_minutes: parsed.data.cart_time_duration_minutes ?? 15,
      p_producer_id: parsed.data.producer_id,
      p_ticket_purchase_per_user: parsed.data.ticket_purchase_per_user ?? 0,
      p_venue_to_be_announced: parsed.data.venue_to_be_announced,
      p_schedule_to_be_announced: parsed.data.schedule_to_be_announced,
    };

    let payload: Record<string, unknown> = rpcPayload;
    let usedTbaRpcParams = true;
    let res = await supabase.rpc("update_admin_event", payload);

    // PostgREST PGRST202: no function with this argument list — try older signatures.
    if (res.error?.code === "PGRST202") {
      const {
        p_venue_to_be_announced: _vTba,
        p_schedule_to_be_announced: _sTba,
        ...withoutTba
      } = payload;
      void _vTba;
      void _sTba;
      payload = withoutTba;
      usedTbaRpcParams = false;
      res = await supabase.rpc("update_admin_event", payload);
    }

    if (res.error?.code === "PGRST202") {
      const { p_ticket_purchase_per_user: _tp, ...withoutTicket } = payload;
      void _tp;
      payload = withoutTicket;
      res = await supabase.rpc("update_admin_event", payload);
    }

    const { data, error } = res;

    // DB has `venue_to_be_announced` / `schedule_to_be_announced` columns but RPC not yet updated:
    // persist flags after legacy `update_admin_event` succeeds.
    if (!error && data && !usedTbaRpcParams) {
      const { error: tbaPatchError } = await supabase
        .from("events")
        .update({
          venue_to_be_announced: parsed.data.venue_to_be_announced,
          schedule_to_be_announced: parsed.data.schedule_to_be_announced,
        })
        .eq("id", id);
      if (tbaPatchError) {
        console.warn("[api/admin/events/[id]] TBA columns patch skipped", tbaPatchError.message);
      }
    }

    if (error) {
      console.error("[api/admin/events/[id]] update_admin_event failed", {
        id,
        error,
        teaser_video_url: parsed.data.teaser_video_url ?? null,
        normalized_teaser_video_url: normalizedTeaserVideoUrl,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Event not found or forbidden" }, { status: 404 });
    }

    return NextResponse.json({ id: data });
  } catch (error) {
    console.error("[api/admin/events/[id]] PATCH unhandled error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update event" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isSuperAdmin = await requireSuperAdmin();
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden: super_admin only" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Verify event exists
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Delete in dependency order (tables without CASCADE from events)
  const cartIds = await supabase
    .from("reservation_carts")
    .select("id")
    .eq("event_id", id)
    .then((r) => (r.data ?? []).map((c) => c.id));

  if (cartIds.length > 0) {
    const { error: riError } = await supabase
      .from("reservation_items")
      .delete()
      .in("cart_id", cartIds);
    if (riError) {
      return NextResponse.json({ error: riError.message }, { status: 500 });
    }
  }

  const { error: rcError } = await supabase
    .from("reservation_carts")
    .delete()
    .eq("event_id", id);
  if (rcError) {
    return NextResponse.json({ error: rcError.message }, { status: 500 });
  }

  const { error: arError } = await supabase
    .from("admission_records")
    .delete()
    .eq("event_id", id);
  if (arError) {
    return NextResponse.json({ error: arError.message }, { status: 500 });
  }

  const bookingIds = await supabase
    .from("bookings")
    .select("id")
    .eq("event_id", id)
    .then((r) => (r.data ?? []).map((b) => b.id));

  if (bookingIds.length > 0) {
    const { error: tError } = await supabase
      .from("tickets")
      .delete()
      .in("booking_id", bookingIds);
    if (tError) {
      return NextResponse.json({ error: tError.message }, { status: 500 });
    }
    const { error: pError } = await supabase
      .from("payments")
      .delete()
      .in("booking_id", bookingIds);
    if (pError) {
      return NextResponse.json({ error: pError.message }, { status: 500 });
    }
  }

  const { error: bError } = await supabase
    .from("bookings")
    .delete()
    .eq("event_id", id);
  if (bError) {
    return NextResponse.json({ error: bError.message }, { status: 500 });
  }

  const { error: evError } = await supabase
    .from("events")
    .delete()
    .eq("id", id);
  if (evError) {
    return NextResponse.json({ error: evError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
