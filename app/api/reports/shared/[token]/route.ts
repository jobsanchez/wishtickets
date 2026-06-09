import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildDashboardMetricsReport } from "@/lib/reports/dashboard-metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: link, error: linkError } = await supabase
    .from("shared_report_links")
    .select("event_id, date_from, date_to, created_at, expires_at, created_by")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  if (!link) {
    return NextResponse.json({ error: "This shared report link is invalid or expired." }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("get_shared_dashboard_metrics", {
    p_event_id: link.event_id,
    p_date_from: link.date_from,
    p_date_to: link.date_to,
    p_actor_user_id: link.created_by,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: data.error === "Event not found" ? 404 : 403 });
  }

  const reportWithComputedFields = await buildDashboardMetricsReport({
    eventId: link.event_id,
    dateFrom: link.date_from,
    dateTo: link.date_to,
    baseData: data as Record<string, unknown>,
  });

  return NextResponse.json({
    generated_at: link.created_at,
    expires_at: link.expires_at,
    report: reportWithComputedFields,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
