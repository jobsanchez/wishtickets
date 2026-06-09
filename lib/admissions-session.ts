import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admissions_session";
const SECRET =
  process.env.ADMISSIONS_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret-change-in-prod";

export interface AdmissionsSession {
  event_id: string;
  code: string;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function encodeSession(session: AdmissionsSession): string {
  const payload = JSON.stringify(session);
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export function decodeSession(value: string): AdmissionsSession | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const expected = sign(encoded);
  try {
    if (!timingSafeEqual(Buffer.from(signature, "base64url"), Buffer.from(expected, "base64url"))) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const data = JSON.parse(payload) as AdmissionsSession;
    if (typeof data.event_id !== "string" || typeof data.code !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
