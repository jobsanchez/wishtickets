import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessTicketResendAdminTools,
  canAccessTicketResendAdminToolsWithClient,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  releaseConfirmedTicket,
  ReleaseTicketError,
} from "@/lib/admin/release-ticket";
import { rotateEncryptedQrForSeatOnRelease } from "@/lib/event-seats/seat-encrypted-qr";

/** Seat to rotate when ticket row has no `seat_id` but verify matched `event_seats.encrypted_qr`. */
async function resolveSeatIdForEncryptedQrRotation(
  admin: ReturnType<typeof createAdminClient>,
  ticketSeatId: string | null | undefined,
  payloadQr: string
): Promise<string | null> {
  if (ticketSeatId) return String(ticketSeatId);
  const { data: rows, error } = await admin
    .from("event_seats")
    .select("id")
    .ilike("encrypted_qr", payloadQr)
    .limit(2);
  if (error || !rows?.length) return null;
  if (rows.length > 1) return null;
  return String(rows[0]!.id);
}

function normQr(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

type InvalidatePayload = {
  encryptedQr?: string;
  ticketId?: string;
};

function parsePayload(raw: unknown): InvalidatePayload {
  if (!raw || typeof raw !== "object") return {};
  const body = raw as Record<string, unknown>;
  return {
    encryptedQr:
      typeof body.encryptedQr === "string"
        ? body.encryptedQr.trim().toUpperCase()
        : undefined,
    ticketId: typeof body.ticketId === "string" ? body.ticketId.trim() : undefined,
  };
}

export type AdminTicketsInvalidatePlainResult = {
  httpStatus: number;
  ok: boolean;
  seatStatus?: "available" | "reserved";
  error?: string;
};

function invFail(httpStatus: number, error: string): AdminTicketsInvalidatePlainResult {
  return { httpStatus, ok: false, error };
}

export async function runAdminTicketsInvalidatePlain(
  body: unknown,
  options?: { authSupabase?: SupabaseClient }
): Promise<AdminTicketsInvalidatePlainResult> {
  const allowed = options?.authSupabase
    ? await canAccessTicketResendAdminToolsWithClient(options.authSupabase)
    : await canAccessTicketResendAdminTools();
  if (!allowed) {
    return invFail(403, "Forbidden");
  }

  const payload = parsePayload(body);
  if (!payload.encryptedQr || !payload.ticketId) {
    return invFail(400, "Encrypted QR and ticket ID are required");
  }

  const admin = createAdminClient();
  const { data: ticketRow, error: ticketLookupError } = await admin
    .from("tickets")
    .select("id, seat_id, encrypted_qr, qr_data")
    .eq("id", payload.ticketId)
    .maybeSingle();

  if (ticketLookupError) {
    return invFail(
      500,
      ticketLookupError.message ?? "Failed to load ticket"
    );
  }
  if (!ticketRow) {
    return invFail(404, "Ticket not found");
  }

  const payloadQr = payload.encryptedQr;
  let qrMatches =
    normQr(ticketRow.encrypted_qr as string | null) === payloadQr ||
    normQr(ticketRow.qr_data as string | null) === payloadQr;

  if (!qrMatches && ticketRow.seat_id) {
    const { data: seatRow, error: seatErr } = await admin
      .from("event_seats")
      .select("encrypted_qr")
      .eq("id", ticketRow.seat_id as string)
      .maybeSingle();
    if (seatErr) {
      return invFail(500, seatErr.message ?? "Failed to validate seat QR");
    }
    qrMatches = normQr(seatRow?.encrypted_qr as string | null) === payloadQr;
  }

  if (!qrMatches) {
    return invFail(
      404,
      "QR does not match this ticket or its seat master code (event_seats.encrypted_qr)"
    );
  }

  const seatIdForQrRotation = await resolveSeatIdForEncryptedQrRotation(
    admin,
    ticketRow.seat_id as string | null | undefined,
    payloadQr
  );

  try {
    // Service-role client avoids RLS stalls on ticket/booking deletes + seat updates (user client could hang).
    const result = await releaseConfirmedTicket(admin, payload.ticketId, {
      forceSeatAvailable: true,
      clearManualDistributionSeat: true,
    });

    if (seatIdForQrRotation) {
      await rotateEncryptedQrForSeatOnRelease(admin, seatIdForQrRotation);
    }

    return { httpStatus: 200, ok: true, seatStatus: result.seatStatus };
  } catch (error) {
    if (error instanceof ReleaseTicketError) {
      return invFail(error.status, error.message);
    }
    const message =
      error instanceof Error ? error.message : "Failed to invalidate ticket";
    return invFail(500, message);
  }
}

export async function runAdminTicketsInvalidateFromBody(
  body: unknown,
  options?: { authSupabase?: SupabaseClient }
): Promise<NextResponse> {
  const r = await runAdminTicketsInvalidatePlain(body, options);
  if (r.httpStatus === 403) {
    return NextResponse.json({ error: r.error ?? "Forbidden" }, { status: 403 });
  }
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error ?? "Failed to invalidate ticket" },
      { status: r.httpStatus }
    );
  }
  return NextResponse.json({ ok: true, seatStatus: r.seatStatus }, { status: 200 });
}

export async function adminTicketsInvalidatePost(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  return runAdminTicketsInvalidateFromBody(body);
}
