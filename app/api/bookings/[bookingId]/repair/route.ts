import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmBooking } from "@/lib/confirm-booking";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const t0 = Date.now();
  const { bookingId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: booking }, { data: roleData }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, user_id, status, ticket_email_sent_at")
      .eq("id", bookingId)
      .single(),
    supabase.rpc("get_my_role"),
  ]);
  const role = (roleData as string | null) ?? null;
  const isAdmin = role === "admin" || role === "super_admin";

  if (!booking || (!isAdmin && booking.user_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json(
      { error: "Repair only supported for confirmed bookings" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  try {
    if (booking.ticket_email_sent_at != null) {
      await admin
        .from("bookings")
        .update({ ticket_email_sent_at: null })
        .eq("id", bookingId);
    }

    const result = await confirmBooking(admin, bookingId);
    const { data: remaining } = await admin
      .from("tickets")
      .select("id")
      .eq("booking_id", bookingId)
      .is("ticket_image_url", null);

    console.log("[api/bookings/repair] done", {
      bookingId,
      userId: user.id,
      role,
      ok: result.ok,
      emailSent: result.emailSent ?? false,
      ticketsGeneratedCount: result.ticketsGeneratedCount ?? 0,
      remainingMissingImages: remaining?.length ?? 0,
      duration_ms: Date.now() - t0,
    });

    return NextResponse.json({
      ok: result.ok,
      email_sent: result.emailSent ?? false,
      tickets_generated_count: result.ticketsGeneratedCount ?? 0,
      remaining_missing_images:
        result.remainingMissingImages ?? remaining?.length ?? 0,
      already_confirmed: result.alreadyConfirmed ?? true,
      error_code: result.errorCode ?? null,
    });
  } catch (err) {
    console.error("[api/bookings/repair] failed", {
      bookingId,
      userId: user.id,
      role,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - t0,
    });
    return NextResponse.json(
      { error: "Failed to repair booking ticket processing" },
      { status: 500 }
    );
  }
}

