import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decodeSession, COOKIE_NAME } from "@/lib/admissions-session";

export async function GET() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  const session = cookieValue ? decodeSession(cookieValue) : null;

  if (!session) {
    return NextResponse.json({ records: [] });
  }

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("validate_admissions_code", {
    p_code: session.code,
  });
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row || row.event_id !== session.event_id) {
    return NextResponse.json({ records: [] });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const adminSupabase = createAdminClient();
  const { data: records } = await adminSupabase
    .from("admission_records")
    .select("qr_data, action, created_at, section_label, row_label, seat_number")
    .eq("event_id", session.event_id)
    .eq("admission_code", session.code)
    .order("created_at", { ascending: false });

  const admitRows = (records ?? []).filter((r) => r.action === "admit");
  // One row per ticket: re-entry consumption inserts a second "admit" row — keep latest scan per qr_data.
  const admittedByCode = new Map<
    string,
    {
      code: string;
      at: string;
      section: string;
      row: string;
      seatNumber: string;
    }
  >();
  for (const r of admitRows) {
    const code = r.qr_data;
    const entry = {
      code,
      at: r.created_at,
      section: r.section_label ?? "",
      row: r.row_label ?? "",
      seatNumber: r.seat_number ?? "",
    };
    const prev = admittedByCode.get(code);
    if (!prev || new Date(entry.at).getTime() >= new Date(prev.at).getTime()) {
      admittedByCode.set(code, entry);
    }
  }
  const admitted = Array.from(admittedByCode.values()).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
  const grantedReEntry = (records ?? [])
    .filter((r) => r.action === "re_entry_granted")
    .map((r) => ({
      code: r.qr_data,
      at: r.created_at,
      section: r.section_label ?? "",
      row: r.row_label ?? "",
      seatNumber: r.seat_number ?? "",
    }));

  return NextResponse.json({
    admitted,
    grantedReEntry,
  });
}
