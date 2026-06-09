import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";
import { runAdmissionScan } from "@/lib/admissions/admission-scan-server";

const scanSchema = z.object({
  qr_data: z.string().min(1),
  event_id: z.string().uuid(),
  re_entry: z.boolean().optional(),
  /** Accept boolean or string (some clients stringify JSON fields). */
  validate_only: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === "true" || v === "1"),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = scanSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.flatten();
    const msg =
      issues.formErrors?.[0] ??
      issues.fieldErrors?.qr_data?.[0] ??
      issues.fieldErrors?.event_id?.[0] ??
      "Invalid payload";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { qr_data, event_id, re_entry, validate_only } = parsed.data;

  if (event_id !== session.event_id) {
    return NextResponse.json(
      { error: "Event mismatch" },
      { status: 403 }
    );
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminSupabase = createAdminClient();

  const result = await runAdmissionScan(adminSupabase, session, {
    qr_data,
    re_entry,
    validate_only,
  });
  return NextResponse.json(result.body, { status: result.status });
}
