import type { NextApiRequest, NextApiResponse } from "next";
import { runAdminTicketsInvalidateFromBody } from "@/lib/admin/tickets-invalidate-post";
import { createSupabasePagesApiClient } from "@/lib/supabase/pages-api";

/** Pages Router fallback for ticket invalidation (pairs with `tickets-verify.ts`). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const authSupabase = createSupabasePagesApiClient(req, res);
  const response = await runAdminTicketsInvalidateFromBody(req.body, { authSupabase });
  const data = await response.json();
  return res.status(response.status).json(data);
}
