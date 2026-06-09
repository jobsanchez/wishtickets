import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * For post-payment UI: true when every ticket for the booking has a generated ticket_image_url.
 */
export async function GET(
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
    .select("id, user_id, status")
    .eq("id", bookingId)
    .single();
  if (!booking || booking.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (booking.status !== "confirmed") {
    return NextResponse.json({
      complete: false,
      booking_status: booking.status,
      tickets_total: 0,
      tickets_with_image: 0,
    });
  }
  const { data: rows } = await supabase
    .from("tickets")
    .select("ticket_image_url")
    .eq("booking_id", bookingId);
  const list = rows ?? [];
  const ticketsTotal = list.length;
  const ticketsWithImage = list.filter((r) => r.ticket_image_url && String(r.ticket_image_url).trim() !== "").length;
  const complete = ticketsTotal > 0 && ticketsWithImage === ticketsTotal;
  return NextResponse.json({
    complete,
    tickets_total: ticketsTotal,
    tickets_with_image: ticketsWithImage,
    booking_status: booking.status,
  });
}
