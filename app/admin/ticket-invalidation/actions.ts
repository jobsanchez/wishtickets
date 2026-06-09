"use server";

import {
  runAdminTicketsInvalidatePlain,
  type AdminTicketsInvalidatePlainResult,
} from "@/lib/admin/tickets-invalidate-post";
import {
  runAdminTicketsVerifyPlain,
  type AdminTicketsVerifyPlainResult,
} from "@/lib/admin/tickets-verify-post";
import { createClient } from "@/lib/supabase/server";

export type AdminVerifyTicketActionResult = AdminTicketsVerifyPlainResult;
export type AdminInvalidateTicketActionResult = AdminTicketsInvalidatePlainResult;

export async function adminVerifyTicketAction(
  encryptedQr: string
): Promise<AdminVerifyTicketActionResult> {
  const supabase = await createClient();
  return runAdminTicketsVerifyPlain(
    { encryptedQr: encryptedQr.trim().toUpperCase() },
    { authSupabase: supabase }
  );
}

export async function adminInvalidateTicketAction(
  encryptedQr: string,
  ticketId: string
): Promise<AdminInvalidateTicketActionResult> {
  const supabase = await createClient();
  return runAdminTicketsInvalidatePlain(
    {
      encryptedQr: encryptedQr.trim().toUpperCase(),
      ticketId: ticketId.trim(),
    },
    { authSupabase: supabase }
  );
}
