import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";
import { releaseBookingAddOn } from "@/lib/admissions/release-booking-add-on";

const bodySchema = z.object({
  booking_add_on_id: z.string().uuid(),
  event_id: z.string().uuid(),
  release_quantity: z.number().int().min(1),
});

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

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    const msg =
      issues.formErrors?.[0] ??
      issues.fieldErrors?.booking_add_on_id?.[0] ??
      issues.fieldErrors?.release_quantity?.[0] ??
      issues.fieldErrors?.event_id?.[0] ??
      "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminSupabase = createAdminClient();
  const result = await releaseBookingAddOn(adminSupabase, session, parsed.data);
  return NextResponse.json(result.body, { status: result.status });
}
