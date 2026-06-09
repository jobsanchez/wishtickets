import type { NextApiRequest, NextApiResponse } from "next";
import { runAdminTicketsVerifyFromBody } from "@/lib/admin/tickets-verify-post";
import { createSupabasePagesApiClient } from "@/lib/supabase/pages-api";

/**
 * Pages Router fallback for ticket verify (some dev environments return 404 for App Router
 * `app/api/admin/tickets/verify` even though the route exists).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const authSupabase = createSupabasePagesApiClient(req, res);
  const response = await runAdminTicketsVerifyFromBody(req.body, { authSupabase });
  const data = await response.json();
  return res.status(response.status).json(data);
}
