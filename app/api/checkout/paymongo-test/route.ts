import { NextResponse } from "next/server";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";

/**
 * GET /api/checkout/paymongo-test
 * Tests PayMongo link creation. Returns status and error details for debugging.
 * Safe to call in development — creates a 1 PHP test link.
 */
export async function GET() {
  const secret = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({
      ok: false,
      error: "PAYMONGO_SECRET_KEY is not set in .env.local",
    });
  }

  const res = await fetch(`${PAYMONGO_BASE}/links`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: 100,
          currency: "PHP",
          description: "Test link",
          remarks: "test",
        },
      },
    }),
  });

  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }

  if (res.ok) {
    const json = parsed as { data?: { attributes?: { checkout_url?: string } } };
    if (json?.data?.attributes?.checkout_url) {
      return NextResponse.json({ ok: true, message: "PayMongo link created successfully" });
    }
  }

  return NextResponse.json({
    ok: false,
    status: res.status,
    error: parsed,
    hint:
      res.status === 401
        ? "Invalid API key. Copy the Secret Key from PayMongo Dashboard → Developers → API Keys."
        : res.status === 422
          ? "Invalid request. Check the 'error' field above for PayMongo's validation message."
          : "Check PAYMONGO_SECRET_KEY format and restart the dev server.",
  });
}
