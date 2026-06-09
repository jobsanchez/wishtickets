import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, requireSuperAdminOrCapability } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface ShareRequestBody {
  event_id?: string;
  date_from?: string | null;
  date_to?: string | null;
}

export async function POST(request: NextRequest) {
  const canView = await requireSuperAdminOrCapability("view_sales_analytics");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ShareRequestBody;
  try {
    body = (await request.json()) as ShareRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = body.event_id;
  if (!eventId || !UUID_REGEX.test(eventId)) {
    return NextResponse.json({ error: "event_id is required and must be a valid UUID" }, { status: 400 });
  }

  const dateFrom = body.date_from && DATE_REGEX.test(body.date_from) ? body.date_from : null;
  const dateTo = body.date_to && DATE_REGEX.test(body.date_to) ? body.date_to : null;

  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const token = randomBytes(24).toString("base64url");

  const { error } = await supabase.from("shared_report_links").insert({
    token,
    event_id: eventId,
    date_from: dateFrom,
    date_to: dateTo,
    created_by: userId,
    expires_at: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shareUrl = `${request.nextUrl.origin}/reports/shared/${token}`;
  return NextResponse.json({ url: shareUrl, token, expires_at: null });
}
