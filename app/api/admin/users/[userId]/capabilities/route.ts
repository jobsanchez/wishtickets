import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import type { Capability } from "@/lib/capabilities";
import { z } from "zod";

const capabilityEnum = z.enum([
  "manage_seats",
  "manage_events",
  "manage_venues",
  "manage_prices",
  "view_sales_analytics",
  "manage_assignments",
  "manage_event_administrators",
  "manage_event_admissions_codes",
  "manage_ticket_templates",
  "refund_lookup",
  "resend_tickets",
]);
const capabilitiesSchema = z.object({
  capabilities: z.array(capabilityEnum),
});

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const isSuperAdmin = await requireSuperAdmin();
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await _request.json();
  const parsed = capabilitiesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const capabilities = parsed.data.capabilities as Capability[];

  const { data: ok, error } = await supabase.rpc("set_user_capabilities", {
    p_user_id: userId,
    p_capabilities: capabilities,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        capabilities,
        debug: "RPC failed; capabilities above were sent",
      },
      { status: 500 }
    );
  }
  if (!ok) {
    return NextResponse.json(
      {
        error: "Forbidden: only super_admin can save capabilities",
        capabilities,
        debug: "RPC returned false; capabilities above were sent",
      },
      { status: 403 }
    );
  }
  return NextResponse.json({ success: true });
}
