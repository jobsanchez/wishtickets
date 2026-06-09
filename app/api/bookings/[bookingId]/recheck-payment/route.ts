import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaymongoPaid } from "@/lib/paymongo";
import { confirmBooking } from "@/lib/confirm-booking";

/** POST /api/bookings/[bookingId]/recheck-payment - Re-verify PayMongo and confirm if paid. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, user_id")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: payment } = await supabase
    .from("payments")
    .select("paymongo_id")
    .eq("booking_id", bookingId)
    .single();
  if (!payment?.paymongo_id) {
    return NextResponse.json({ success: false, reason: "no_payment" });
  }
  if (await isPaymongoPaid(payment.paymongo_id)) {
    const admin = createAdminClient();
    await confirmBooking(admin, bookingId);
    return NextResponse.json({ success: true });
  }
  return NextResponse.json({ success: false, reason: "not_paid" });
}
