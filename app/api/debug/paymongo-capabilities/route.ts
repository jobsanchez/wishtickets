import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymongoSecretKey } from "@/lib/paymongo-config";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

/**
 * GET /api/debug/paymongo-capabilities
 * Calls PayMongo merchant capabilities using the currently active configured secret key.
 * Requires signed-in user (kept same access level as other debug payment endpoints).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = await getPaymongoSecretKey();
  if (!secret) {
    return NextResponse.json(
      { error: "PayMongo secret not configured for active mode." },
      { status: 500 }
    );
  }

  const res = await fetch(
    `${PAYMONGO_BASE}/merchants/capabilities/payment_methods`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      },
      cache: "no-store",
    }
  );

  const text = await res.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Keep raw text payload
  }

  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      endpoint: "/v1/merchants/capabilities/payment_methods",
      paymongo_response: payload,
    },
    { status: res.ok ? 200 : res.status }
  );
}
