import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { parseEventStartInput } from "@/lib/event-datetime";
import { z } from "zod";

export async function GET() {
  const supabase = await createClient();
  const canView = await requireSuperAdminOrCapability("manage_events");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_admin_events");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const msg =
      flat.fieldErrors && Object.keys(flat.fieldErrors).length > 0
        ? Object.entries(flat.fieldErrors)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("; ")
        : flat.formErrors?.join("; ") ?? "Invalid payload";
    return NextResponse.json(
      { error: msg, details: flat },
      { status: 400 }
    );
  }

  const normalizedTeaserVideoUrl = normalizeTeaserVideoUrl(parsed.data.teaser_video_url ?? null);

  const { data, error } = await supabase
    .from("events")
    .insert({
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      short_description: parsed.data.description?.slice(0, 200) ?? null,
      category: parsed.data.category,
      status: parsed.data.status ?? "draft",
      image_url: parsed.data.image_url ?? null,
      thumbnail_url: parsed.data.thumbnail_url ?? parsed.data.image_url ?? null,
      teaser_video_url: normalizedTeaserVideoUrl,
      event_start: parseEventStartInput(parsed.data.event_start).toISOString(),
      venue_id: parsed.data.venue_to_be_announced ? null : parsed.data.venue_id,
      venue_to_be_announced: parsed.data.venue_to_be_announced,
      schedule_to_be_announced: parsed.data.schedule_to_be_announced,
      producer_id: parsed.data.producer_id,
      created_by: user.id,
      cart_time_duration_minutes: parsed.data.cart_time_duration_minutes ?? 15,
      ticket_purchase_per_user: parsed.data.ticket_purchase_per_user ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api/admin/events] create event failed", {
      error,
      teaser_video_url: parsed.data.teaser_video_url ?? null,
      normalized_teaser_video_url: normalizedTeaserVideoUrl,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: assign creator as event administrator so they can manage this event.
  try {
    await supabase.rpc("assign_event_admin", { p_event_id: data.id });
  } catch {
    // Ignore failures; super admins can still see/manage all events.
  }

  return NextResponse.json(data);
}
