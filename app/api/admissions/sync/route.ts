import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";
import { runAdmissionScan } from "@/lib/admissions/admission-scan-server";

const bodySchema = z.object({
  ops: z
    .array(
      z.discriminatedUnion("mode", [
        z.object({
          id: z.string().min(1).max(200),
          qr_data: z.string().min(1),
          mode: z.literal("admit"),
        }),
        z.object({
          id: z.string().min(1).max(200),
          qr_data: z.string().min(1),
          mode: z.literal("re_entry"),
        }),
        z.object({
          id: z.string().min(1).max(200),
          mode: z.literal("release_add_on"),
          booking_add_on_id: z.string().uuid(),
          release_quantity: z.number().int().min(1),
          event_id: z.string().uuid().optional(),
        }),
      ])
    )
    .max(2000),
});

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  const session = cookieValue ? decodeSession(cookieValue) : null;

  if (!session) {
    return NextResponse.json(
      { error: "Enter an admissions code first" },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("validate_admissions_code", {
    p_code: session.code,
  });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || row.event_id !== session.event_id) {
    return NextResponse.json(
      { error: "Admissions code expired or invalid" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors[0] ?? "Invalid body" },
      { status: 400 }
    );
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminSupabase = createAdminClient();
  const { releaseBookingAddOn } = await import("@/lib/admissions/release-booking-add-on");

  const seenIds = new Set<string>();
  const results: Array<{
    id: string;
    httpStatus: number;
    body: Record<string, unknown>;
  }> = [];

  for (const op of parsed.data.ops) {
    if (seenIds.has(op.id)) {
      results.push({
        id: op.id,
        httpStatus: 200,
        body: { ok: true, deduped: true },
      });
      continue;
    }
    seenIds.add(op.id);
    if (op.mode === "release_add_on") {
      const res = await releaseBookingAddOn(adminSupabase, session, {
        booking_add_on_id: op.booking_add_on_id,
        release_quantity: op.release_quantity,
        event_id: op.event_id ?? session.event_id,
      });
      results.push({ id: op.id, httpStatus: res.status, body: res.body });
    } else {
      const res = await runAdmissionScan(adminSupabase, session, {
        qr_data: op.qr_data,
        re_entry: op.mode === "re_entry",
        validate_only: false,
      });
      results.push({ id: op.id, httpStatus: res.status, body: res.body });
    }
  }

  return NextResponse.json({ ok: true, results });
}
