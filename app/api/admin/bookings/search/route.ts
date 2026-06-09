import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canAccessTicketResendAdminTools } from "@/lib/auth";

const MIN_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

interface AdminConfirmedBookingForResendRow {
  booking_id: string;
  event_title: string;
  event_start_display: string;
  buyer_name: string;
  buyer_email: string;
  total_tickets: number;
  tickets: AdminConfirmedBookingForResendTicketRow[] | null;
  booking_created_display: string;
  special_request_type: string | null;
  special_request_details: string | null;
}

interface AdminConfirmedBookingForResendTicketRow {
  id: string;
  section_name: string;
  seat_label: string;
}

export async function GET(request: NextRequest) {
  if (!(await canAccessTicketResendAdminTools())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const name = (url.searchParams.get("name") ?? "").trim().toLowerCase();

  const emailOk = email.length >= MIN_QUERY_LENGTH;
  const nameOk = name.length >= MIN_QUERY_LENGTH;

  if (!emailOk && !nameOk) {
    return NextResponse.json(
      {
        error: `Provide email or buyer name with at least ${MIN_QUERY_LENGTH} characters`,
        bookings: [],
      },
      { status: 400 }
    );
  }

  let limit = DEFAULT_LIMIT;
  const limitParam = url.searchParams.get("limit");
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "get_admin_confirmed_bookings_for_resend",
    {
      p_email: emailOk ? email : null,
      p_name: nameOk ? name : null,
    },
  );

  if (error) {
    console.error("[admin/bookings/search] rpc error", error);
    return NextResponse.json({ error: "Failed to search bookings" }, { status: 500 });
  }

  const rows = ((data ?? []) as AdminConfirmedBookingForResendRow[]).slice(0, limit);

  const bookings = rows.map((r) => ({
    id: r.booking_id as string,
    eventTitle: r.event_title as string,
    eventStart: r.event_start_display as string,
    bookingCreated: r.booking_created_display as string,
    buyerName: r.buyer_name as string,
    buyerEmail: r.buyer_email as string,
    totalTickets: r.total_tickets as number,
    specialRequestType: (r.special_request_type as string | null) ?? "none",
    specialRequestDetails: (r.special_request_details as string | null) ?? null,
    tickets: (r.tickets ?? []).map((t) => ({
      id: t.id as string,
      sectionName: t.section_name as string,
      seatLabel: t.seat_label as string,
    })) ?? [],
  }));

  return NextResponse.json({ bookings });
}
