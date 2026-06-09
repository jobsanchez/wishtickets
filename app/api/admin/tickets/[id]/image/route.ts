import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import {
  generateTicketImageForTicketId,
  ticketImageContentTypeFromUrl,
} from "@/lib/ticket-image";

async function canViewTickets() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments") ||
    hasCapability(userId, "view_sales_analytics")
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: ticketId } = await params;
  if (!(await canViewTickets())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, ticket_image_url, qr_data")
    .eq("id", ticketId)
    .single();

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let url = ticket.ticket_image_url;
  if (!url) {
    url = await generateTicketImageForTicketId(ticketId);
  }

  if (!url) {
    return NextResponse.json({ error: "Could not generate ticket image" }, { status: 500 });
  }

  // Proxy the image instead of redirecting to avoid net::ERR_INCOMPLETE_CHUNKED_ENCODING
  // when loading custom ticket templates/images from Supabase storage.
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to load ticket image" }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const headerCt = res.headers.get("content-type");
    const contentType =
      headerCt && headerCt.trim().length > 0
        ? headerCt
        : ticketImageContentTypeFromUrl(url);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    console.warn("[ticket-image] Proxy fetch failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed to load ticket image" }, { status: 502 });
  }
}
