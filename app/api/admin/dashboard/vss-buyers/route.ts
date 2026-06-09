import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildVssBuyerSummaries,
  buildVssBuyerTickets,
} from "@/lib/reports/revenue-buyer-vss";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const canView = await requireSuperAdminOrCapability("view_sales_analytics");
  if (!canView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");
  const buyerName = searchParams.get("buyer_name");
  const buyerEmail = searchParams.get("buyer_email");

  if (!eventId || !UUID_REGEX.test(eventId)) {
    return NextResponse.json(
      { error: "event_id is required and must be a valid UUID" },
      { status: 400 }
    );
  }

  let pDateFrom: string | null = null;
  let pDateTo: string | null = null;
  if (dateFrom && DATE_REGEX.test(dateFrom)) pDateFrom = dateFrom;
  if (dateTo && DATE_REGEX.test(dateTo)) pDateTo = dateTo;

  const admin = createAdminClient();

  try {
    if (buyerName != null || buyerEmail != null) {
      const tickets = await buildVssBuyerTickets(
        admin,
        eventId,
        pDateFrom,
        pDateTo,
        (buyerName ?? "").trim() || "Guest",
        (buyerEmail ?? "").trim()
      );
      return NextResponse.json({ tickets });
    }

    const buyers = await buildVssBuyerSummaries(admin, eventId, pDateFrom, pDateTo);
    return NextResponse.json({ buyers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load buyer VSS";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
