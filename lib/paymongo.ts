import crypto from "crypto";
import { getPaymongoSecretKey } from "@/lib/paymongo-config";
import {
  SAFE_FALLBACK_PAYMONGO_METHODS,
  sanitizePaymongoMethods,
  type PaymongoMethodId,
} from "@/lib/paymongo-methods";

const PAYMONGO_BASE = "https://api.paymongo.com/v1";
const PAYMONGO_METHOD_ALIASES: Record<string, string> = {
  cards: "card",
  shopeepay: "shopee_pay",
  grabpay: "grab_pay",
};

function normalizePaymongoMethodId(raw: string): string {
  const v = raw.trim().toLowerCase();
  return PAYMONGO_METHOD_ALIASES[v] ?? v;
}

function extractPaymongoErrorSummary(raw: string): {
  message: string;
  details: Array<{ code?: string; title?: string; detail?: string }>;
} {
  try {
    const parsed = JSON.parse(raw) as {
      errors?: Array<{ code?: string; title?: string; detail?: string }>;
      message?: string;
    };
    const details = Array.isArray(parsed.errors) ? parsed.errors : [];
    const first = details[0];
    const message =
      first?.detail ??
      first?.title ??
      parsed.message ??
      "PayMongo request failed";
    return { message, details };
  } catch {
    return { message: raw || "PayMongo request failed", details: [] };
  }
}

function extractMerchantPaymentMethodTypes(json: unknown): Set<string> {
  const out = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (node: unknown) => {
    if (!node || seen.has(node)) return;
    if (typeof node === "string") {
      const v = normalizePaymongoMethodId(node);
      if (v) out.add(v);
      return;
    }
    if (typeof node !== "object") return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const directType = obj.type;
    if (typeof directType === "string") {
      const v = normalizePaymongoMethodId(directType);
      if (v) out.add(v);
    }
    const directCode = obj.code;
    if (typeof directCode === "string") {
      const v = normalizePaymongoMethodId(directCode);
      if (v) out.add(v);
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(json);
  return out;
}

async function getMerchantCapablePaymentMethods(secret: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${PAYMONGO_BASE}/merchants/capabilities/payment_methods`, {
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const methods = extractMerchantPaymentMethodTypes(json);
    return methods.size > 0 ? methods : null;
  } catch {
    return null;
  }
}

/**
 * Merchant-capable method IDs from PayMongo account settings (based on active secret key).
 * Returns null when secret/config/network prevents capability lookup.
 */
export async function getMerchantCapablePaymentMethodIds(): Promise<string[] | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return null;
  const methods = await getMerchantCapablePaymentMethods(secret);
  if (!methods || methods.size === 0) return null;
  return [...methods];
}

export async function createPaymentLink(params: {
  amount: number;
  description: string;
  reference_number?: string;
  billing?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}): Promise<{ checkout_url: string; id: string } | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return null;

  const attrs: Record<string, unknown> = {
    amount: Math.round(params.amount) * 100,
    currency: "PHP",
    description: params.description,
    remarks: params.reference_number ?? undefined,
  };

  if (params.billing) {
    const billing: Record<string, string> = {};
    if (params.billing.name?.trim()) billing.name = params.billing.name.trim();
    if (params.billing.email?.trim()) billing.email = params.billing.email.trim();
    if (params.billing.phone?.trim()) billing.phone = params.billing.phone.trim();
    if (Object.keys(billing).length > 0) {
      attrs.billing = billing;
    }
  }

  const res = await fetch(`${PAYMONGO_BASE}/links`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: attrs,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("PayMongo create link error:", res.status, err);
    return null;
  }

  const json = await res.json();
  const resAttrs = json?.data?.attributes;
  if (!resAttrs?.checkout_url) {
    console.error("PayMongo create link: response missing checkout_url", JSON.stringify(json).slice(0, 500));
    return null;
  }
  return {
    checkout_url: resAttrs.checkout_url,
    id: json?.data?.id ?? "",
  };
}

/** Fetch payment from PayMongo API. Returns payment object or null. */
export async function retrievePayment(
  paymentId: string,
  options?: { include?: string }
): Promise<{
  id: string;
  attributes?: {
    link_id?: string;
    remarks?: string;
    status?: string;
    source?: { status?: string; type?: string; id?: string };
  };
} | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return null;
  const q =
    options?.include && options.include.length > 0
      ? `?include=${encodeURIComponent(options.include)}`
      : "";
  const res = await fetch(`${PAYMONGO_BASE}/payments/${paymentId}${q}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const data = json?.data;
  if (!data?.id) return null;
  return {
    id: data.id,
    attributes: data.attributes,
  };
}

/** Source types PayMongo rejects for `POST /v1/refunds` (see dashboard / support for alternatives). */
export const PAYMONGO_API_REFUND_BLOCKED_SOURCE_TYPES = new Set(["qrph"]);

export function isPaymongoSourceTypeBlockedForApiRefund(sourceType: string | null): boolean {
  if (!sourceType || typeof sourceType !== "string") return false;
  return PAYMONGO_API_REFUND_BLOCKED_SOURCE_TYPES.has(sourceType.trim().toLowerCase());
}

/**
 * Reads the Payment’s source type (e.g. `qrph`, `gcash`). Uses `include=source` and falls back to `GET /sources/{id}`.
 */
export async function resolvePaymongoPaymentSourceType(paymentId: string): Promise<string | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret || !paymentId.startsWith("pay_")) return null;

  const res = await fetch(
    `${PAYMONGO_BASE}/payments/${paymentId}?include=${encodeURIComponent("source")}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      },
    }
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: {
      attributes?: { source?: { type?: string; id?: string } };
      relationships?: { source?: { data?: { id?: string } } };
    };
    included?: Array<{ type?: string; id?: string; attributes?: { type?: string } }>;
  };

  const inline = json.data?.attributes?.source;
  if (inline && typeof inline.type === "string" && inline.type.trim()) {
    return inline.type.trim().toLowerCase();
  }

  for (const item of json.included ?? []) {
    if ((item.type ?? "").toLowerCase() !== "source") continue;
    const t = item.attributes?.type;
    if (typeof t === "string" && t.trim()) return t.trim().toLowerCase();
  }

  const relId =
    json.data?.relationships?.source?.data?.id ??
    (inline && typeof inline.id === "string" ? inline.id : undefined);
  if (relId?.startsWith("src_")) {
    const src = await retrieveSource(relId);
    if (src?.type) return src.type.trim().toLowerCase();
  }
  return null;
}

/** Fetch source from PayMongo API. Returns status and source type (`qrph`, `gcash`, etc.). */
async function retrieveSource(sourceId: string): Promise<{ status?: string; type?: string } | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret || !sourceId.startsWith("src_")) return null;
  const res = await fetch(`${PAYMONGO_BASE}/sources/${sourceId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json?.data?.attributes as Record<string, unknown> | undefined;
  if (!attrs) return null;
  return {
    status: typeof attrs.status === "string" ? attrs.status : undefined,
    type: typeof attrs.type === "string" ? attrs.type : undefined,
  };
}

/** Fetch link from PayMongo API. Returns selected link attributes or null. */
export async function retrieveLink(
  linkId: string
): Promise<{ remarks?: string; checkout_url?: string } | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return null;
  const res = await fetch(`${PAYMONGO_BASE}/links/${linkId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json?.data?.attributes;
  return attrs
    ? {
        remarks: attrs.remarks as string | undefined,
        checkout_url: attrs.checkout_url as string | undefined,
      }
    : null;
}

type LinkPaymentStatus = "paid" | "failed" | "pending";

/** Terminal non-paid link statuses from PayMongo (link will not be paid). "unpaid" means awaiting payment, not failed. */
const LINK_FAILED_STATUSES = ["failed", "expired", "cancelled", "archived"];

/** Terminal failure statuses for individual payments. */
const PAYMENT_FAILED_STATUSES = ["failed", "expired", "cancelled"];

function getPaymentStatus(p: {
  data?: { attributes?: { status?: string; source?: { status?: string } } };
  attributes?: { status?: string; source?: { status?: string } };
}): string | undefined {
  const pAttrs = p?.data?.attributes ?? p?.attributes ?? {};
  const status = pAttrs.status;
  // If payment has source with expired status, treat as expired (terminal failure)
  const sourceStatus = (pAttrs.source as { status?: string } | undefined)?.status?.toLowerCase?.();
  if (sourceStatus === "expired") return "expired";
  return status;
}

/** Status values PayMongo may use for successful payment. */
const PAID_STATUSES = ["paid", "succeeded", "completed"];

function isPaidStatus(s: string | undefined): boolean {
  return !!s && PAID_STATUSES.includes((s as string).toLowerCase());
}

/** Extract payment objects from PayMongo link response (handles JSON:API and embedded formats). */
function extractPaymentsFromLinkResponse(json: Record<string, unknown>): Array<{ data?: { attributes?: { status?: string; source?: { status?: string } } }; attributes?: { status?: string; source?: { status?: string } } }> {
  const data = json?.data as Record<string, unknown> | undefined;
  const attrs = (data?.attributes as Record<string, unknown>) ?? {};
  // Embedded: attrs.payments, attrs.payments.data, or data.payments
  const paymentsRaw = attrs.payments ?? data?.payments ?? [];
  let list = Array.isArray(paymentsRaw)
    ? paymentsRaw
    : Array.isArray((paymentsRaw as { data?: unknown[] })?.data)
      ? (paymentsRaw as { data: unknown[] }).data
      : [];
  // JSON:API included: resolve relationships.payments from included
  const rels = data?.relationships as Record<string, { data?: Array<{ id: string; type: string }> }> | undefined;
  const paymentRefs = rels?.payments?.data;
  const included = (json.included as Array<{ id: string; type: string; attributes?: Record<string, unknown> }>) ?? [];
  if (paymentRefs?.length && included.length) {
    const byId = new Map(included.map((i) => [i.id, i]));
    list = paymentRefs
      .map((ref) => byId.get(ref.id))
      .filter(Boolean)
      .map((i) => ({ attributes: i!.attributes }));
  }
  return list as Array<{ data?: { attributes?: { status?: string; source?: { status?: string } } }; attributes?: { status?: string; source?: { status?: string } } }>;
}

/** Fetch link and resolve payment state: paid, failed (expired/cancelled), or pending. */
export async function getLinkPaymentStatus(
  linkId: string
): Promise<LinkPaymentStatus> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return "pending";
  const auth = `Basic ${Buffer.from(secret + ":").toString("base64")}`;
  let res = await fetch(`${PAYMONGO_BASE}/links/${linkId}?include=payments`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) {
    res = await fetch(`${PAYMONGO_BASE}/links/${linkId}?include=payments`, {
      headers: { Authorization: auth },
    });
  }
  if (!res.ok) return "pending";
  const json = (await res.json()) as Record<string, unknown>;
  if (process.env.NODE_ENV === "development" && process.env.DEBUG_PAYMONGO === "1") {
    console.log("[PayMongo getLink] raw response:", JSON.stringify(json).slice(0, 2000));
  }
  const attrs = ((json?.data as Record<string, unknown>)?.attributes as Record<string, unknown>) ?? {};
  const linkStatus = ((attrs.status as string) ?? "")?.toLowerCase?.();

  if (isPaidStatus(linkStatus)) return "paid";
  const list = extractPaymentsFromLinkResponse(json);
  const hasPaid = list.some((p) => isPaidStatus(getPaymentStatus(p)));
  if (hasPaid) return "paid";

  if (linkStatus && LINK_FAILED_STATUSES.includes(linkStatus)) return "failed";
  // When source expires, PayMongo may set last_payment_error (message or nested structure)
  const lastError = attrs.last_payment_error as
    | { message?: string; detail?: string; code?: string }
    | string
    | null
    | undefined;
  if (lastError) {
    const err =
      typeof lastError === "string"
        ? lastError
        : lastError?.message ?? lastError?.detail ?? JSON.stringify(lastError);
    if (err && /expired|has expired status|source.*expired/i.test(err)) return "failed";
  }
  if (list.length > 0) {
    const allTerminal = list.every((p) => {
      const s = getPaymentStatus(p)?.toLowerCase?.();
      return s && PAYMENT_FAILED_STATUSES.includes(s);
    });
    if (allTerminal) return "failed";
  }
  // Fallback: fetch payments by ID when link has relationships but no/incomplete included data
  const rels = (json?.data as Record<string, unknown>)?.relationships as { payments?: { data?: Array<{ id: string }> } } | undefined;
  const paymentIds = rels?.payments?.data?.map((d) => d.id).filter((id) => id?.startsWith("pay_")) ?? [];
  if (paymentIds.length > 0) {
    const payments = await Promise.all(paymentIds.map((id) => retrievePayment(id)));
    for (const p of payments) {
      if (!p?.attributes) continue;
      const status = (p.attributes.status as string)?.toLowerCase?.();
      let sourceStatus = (p.attributes.source as { id?: string; status?: string })?.status?.toLowerCase?.();
      // If payment has source.id but no source.status, fetch source to check expired
      if (!sourceStatus) {
        const sourceId = (p.attributes.source as { id?: string })?.id;
        if (sourceId) {
          const src = await retrieveSource(sourceId);
          sourceStatus = src?.status?.toLowerCase?.();
        }
      }
      if (isPaidStatus(status ?? sourceStatus)) return "paid";
      if (sourceStatus === "expired" || (status && PAYMENT_FAILED_STATUSES.includes(status))) return "failed";
    }
  }
  return "pending";
}

/** Fetch link and check if any payment is paid. Fallback when webhook doesn't fire. */
export async function isLinkPaid(linkId: string): Promise<boolean> {
  return (await getLinkPaymentStatus(linkId)) === "paid";
}

/** Checkout Session API – supports billing prefill (Links API does not). */
export async function createCheckoutSession(params: {
  amountCents: number;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes?: PaymongoMethodId[];
  billing?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}): Promise<{ checkout_url: string; id: string } | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret) return null;

  const configuredMethods = sanitizePaymongoMethods(params.paymentMethodTypes);
  if (configuredMethods.length === 0) {
    console.error("PayMongo checkout session error: no enabled payment methods configured");
    return null;
  }
  let requestedMethods = [...configuredMethods];
  let allowCardAliasProbe = false;
  const merchantMethods = await getMerchantCapablePaymentMethods(secret);
  if (merchantMethods && merchantMethods.size > 0) {
    requestedMethods = configuredMethods.filter((m) => merchantMethods.has(m));
    if (requestedMethods.length === 0) {
      const hasCardConfigured = configuredMethods.includes("card");
      const hasCardsInMerchantCapabilities = merchantMethods.has("cards");
      if (hasCardConfigured || hasCardsInMerchantCapabilities) {
        // Probe checkout even when capabilities mismatch around card/cards naming.
        requestedMethods = ["card"];
        allowCardAliasProbe = true;
      } else {
        console.error("PayMongo checkout session error: selected payment methods unavailable for merchant", {
          configuredMethods,
          merchantMethods: [...merchantMethods],
        });
        return null;
      }
    }
  }
  const fallbackMethods = requestedMethods.filter((m) =>
    SAFE_FALLBACK_PAYMONGO_METHODS.includes(m)
  );

  async function requestCheckoutSession(paymentMethodTypes: string[]) {
    const attrs: Record<string, unknown> = {
      line_items: [
        {
          amount: params.amountCents,
          currency: "PHP",
          name: params.description.slice(0, 255),
          quantity: 1,
        },
      ],
      payment_method_types: paymentMethodTypes,
      description: params.description,
      reference_number: params.referenceNumber,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      show_line_items: false,
      show_description: true,
      send_email_receipt: true,
    };

    if (params.billing) {
      const billing: Record<string, string> = {};
      if (params.billing.name?.trim()) billing.name = params.billing.name.trim();
      if (params.billing.email?.trim()) billing.email = params.billing.email.trim();
      if (params.billing.phone?.trim()) billing.phone = params.billing.phone.trim();
      if (Object.keys(billing).length > 0) attrs.billing = billing;
    }

    const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { attributes: attrs } }),
    });

    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null;
    }

    return { res, text, json };
  }

  const attempt = await requestCheckoutSession(requestedMethods);

  if (!attempt.res.ok) {
    const err = extractPaymongoErrorSummary(attempt.text);
    console.error("PayMongo create checkout session error (strict selected methods):", {
      status: attempt.res.status,
      message: err.message,
      errors: err.details,
      configuredMethods,
      amountCents: params.amountCents,
      referenceNumber: params.referenceNumber,
    });
    if (
      fallbackMethods.length > 0 &&
      fallbackMethods.some((m) => !requestedMethods.includes(m) || requestedMethods.length !== fallbackMethods.length)
    ) {
      const fallbackAttempt = await requestCheckoutSession(fallbackMethods);
      if (fallbackAttempt.res.ok) {
        const fallbackAttrs =
          fallbackAttempt.json?.data && typeof fallbackAttempt.json.data === "object"
            ? (fallbackAttempt.json.data as { attributes?: { checkout_url?: string } }).attributes
            : undefined;
        if (fallbackAttrs?.checkout_url) {
          console.warn(
            "PayMongo checkout session recovered with fallback methods",
            { configuredMethods, fallbackMethods }
          );
          return {
            checkout_url: fallbackAttrs.checkout_url,
            id:
              fallbackAttempt.json?.data && typeof fallbackAttempt.json.data === "object"
                ? ((fallbackAttempt.json.data as { id?: string }).id ?? "")
                : "",
          };
        }
      } else {
        const fallbackErr = extractPaymongoErrorSummary(fallbackAttempt.text);
        console.error(
          "PayMongo create checkout session fallback error:",
          {
            status: fallbackAttempt.res.status,
            message: fallbackErr.message,
            errors: fallbackErr.details,
            fallbackMethods,
            amountCents: params.amountCents,
            referenceNumber: params.referenceNumber,
          }
        );
      }
    }
    if (allowCardAliasProbe && requestedMethods.length === 1 && requestedMethods[0] === "card") {
      const aliasAttempt = await requestCheckoutSession(["cards"]);
      if (aliasAttempt.res.ok) {
        const aliasAttrs =
          aliasAttempt.json?.data && typeof aliasAttempt.json.data === "object"
            ? (aliasAttempt.json.data as { attributes?: { checkout_url?: string } }).attributes
            : undefined;
        if (aliasAttrs?.checkout_url) {
          console.warn("PayMongo checkout session recovered with legacy card alias", {
            configuredMethods,
            requestedMethods,
            aliasMethod: "cards",
          });
          return {
            checkout_url: aliasAttrs.checkout_url,
            id:
              aliasAttempt.json?.data && typeof aliasAttempt.json.data === "object"
                ? ((aliasAttempt.json.data as { id?: string }).id ?? "")
                : "",
          };
        }
      } else {
        const aliasErr = extractPaymongoErrorSummary(aliasAttempt.text);
        console.error("PayMongo create checkout session card alias fallback error:", {
          status: aliasAttempt.res.status,
          message: aliasErr.message,
          errors: aliasErr.details,
          aliasMethod: "cards",
          amountCents: params.amountCents,
          referenceNumber: params.referenceNumber,
        });
      }
    }
    return null;
  }

  const resAttrs = attempt.json?.data && typeof attempt.json.data === "object"
    ? (attempt.json.data as { attributes?: { checkout_url?: string } }).attributes
    : undefined;
  if (!resAttrs?.checkout_url) {
    console.error(
      "PayMongo checkout session: response missing checkout_url",
      JSON.stringify(attempt.json ?? attempt.text).slice(0, 500)
    );
    return null;
  }
  return {
    checkout_url: resAttrs.checkout_url,
    id:
      attempt.json?.data && typeof attempt.json.data === "object"
        ? ((attempt.json.data as { id?: string }).id ?? "")
        : "",
  };
}

/** Fetch checkout session from PayMongo. Returns attributes or null. */
async function retrieveCheckoutSession(sessionId: string): Promise<Record<string, unknown> | null> {
  const secret = await getPaymongoSecretKey();
  if (!secret || !sessionId.startsWith("cs_")) return null;
  const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions/${sessionId}?include=payments`, {
    headers: { Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  const attrs = (json?.data as Record<string, unknown>)?.attributes as Record<string, unknown>;
  return attrs ?? null;
}

/** Resolve checkout URL for either checkout session ID or payment link ID. */
export async function getPaymongoCheckoutUrl(
  paymongoId: string
): Promise<string | null> {
  if (!paymongoId || typeof paymongoId !== "string") return null;
  if (paymongoId.startsWith("cs_")) {
    const attrs = await retrieveCheckoutSession(paymongoId);
    const url = attrs?.checkout_url;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }
  if (paymongoId.startsWith("link_")) {
    const link = await retrieveLink(paymongoId);
    const url = link?.checkout_url;
    return typeof url === "string" && url.trim() ? url.trim() : null;
  }
  return null;
}

/** Fetch checkout session and resolve payment state: paid, failed, or pending. */
export async function getCheckoutSessionStatus(
  sessionId: string
): Promise<LinkPaymentStatus> {
  const attrs = await retrieveCheckoutSession(sessionId);
  if (!attrs) return "pending";

  const status = ((attrs.status as string) ?? "")?.toLowerCase?.();
  if (isPaidStatus(status)) return "paid";

  const paymentsRaw = attrs.payments ?? [];
  const list = Array.isArray(paymentsRaw)
    ? paymentsRaw
    : Array.isArray((paymentsRaw as { data?: unknown[] })?.data)
      ? (paymentsRaw as { data: unknown[] }).data
      : [];
  for (const p of list as Array<{ attributes?: { status?: string; source?: { status?: string } } }>) {
    const s = p?.attributes?.status?.toLowerCase?.();
    const srcStatus = p?.attributes?.source?.status?.toLowerCase?.();
    if (isPaidStatus(s ?? srcStatus)) return "paid";
    if (srcStatus === "expired" || (s && PAYMENT_FAILED_STATUSES.includes(s))) return "failed";
  }

  if (["expired", "cancelled"].includes(status)) return "failed";

  return "pending";
}

/** Check if paymongo_id is a checkout session (cs_xxx) or link (link_xxx). */
export function isCheckoutSessionId(id: string): boolean {
  return id.startsWith("cs_");
}

/** Resolve payment status for either link or checkout session ID. */
export async function getPaymentStatusById(
  paymongoId: string
): Promise<LinkPaymentStatus> {
  if (isCheckoutSessionId(paymongoId)) {
    return getCheckoutSessionStatus(paymongoId);
  }
  return getLinkPaymentStatus(paymongoId);
}

/** Check if payment is paid (works for both link and checkout session). */
export async function isPaymongoPaid(paymongoId: string): Promise<boolean> {
  return (await getPaymentStatusById(paymongoId)) === "paid";
}

/** Fetch reference/invoice number from PayMongo (for checkout session or link). Returns null if not found. */
export async function getPaymongoReferenceNumber(paymongoId: string): Promise<string | null> {
  if (!paymongoId || typeof paymongoId !== "string") return null;
  if (paymongoId.startsWith("cs_")) {
    const attrs = await retrieveCheckoutSession(paymongoId);
    const ref = attrs?.reference_number;
    return typeof ref === "string" && ref.trim() ? ref.trim() : null;
  }
  if (paymongoId.startsWith("link_")) {
    const link = await retrieveLink(paymongoId);
    const ref = link?.remarks;
    return typeof ref === "string" && ref.trim() ? ref.trim() : null;
  }
  return null;
}

/**
 * Collect `pay_` IDs from a PayMongo JSON:API document (checkout session, link, or payment intent).
 * Checkout sessions often embed payments under `attributes.payments`, not only `relationships`.
 */
export function extractPaymentIdsFromPaymongoResourceJson(
  json: Record<string, unknown>
): string[] {
  const found = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === "string" && id.startsWith("pay_")) found.add(id);
  };

  const data = json?.data as Record<string, unknown> | undefined;
  const attrs = (data?.attributes as Record<string, unknown>) ?? {};

  const rels = data?.relationships as
    | Record<string, { data?: { id?: string } | Array<{ id?: string }> }>
    | undefined;
  if (rels?.payments?.data) {
    const raw = rels.payments.data;
    const refs = Array.isArray(raw) ? raw : [raw];
    for (const r of refs) add(r?.id);
  }

  const included = (json.included as Array<{ id: string; type: string }>) ?? [];
  for (const i of included) {
    if (typeof i.id === "string" && i.id.startsWith("pay_")) found.add(i.id);
  }

  const walkEmbedded = (raw: unknown) => {
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown[] }).data)
        ? (raw as { data: unknown[] }).data
        : [];
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      add(o.id);
      const nested = o.data;
      if (nested && typeof nested === "object") add((nested as { id?: string }).id);
    }
  };
  walkEmbedded(attrs.payments);
  if (data && typeof (data as Record<string, unknown>).payments !== "undefined") {
    walkEmbedded((data as Record<string, unknown>).payments);
  }

  return [...found];
}

function extractPaymentIntentIdFromPaymongoResourceJson(
  json: Record<string, unknown>
): string | null {
  const data = json?.data as Record<string, unknown> | undefined;
  const rels = data?.relationships as
    | Record<string, { data?: { id?: string } | Array<{ id?: string }> }>
    | undefined;
  for (const key of ["payment_intent", "paymentIntent"]) {
    const raw = rels?.[key]?.data;
    const refs = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const r of refs) {
      const id = r?.id;
      if (typeof id === "string" && id.startsWith("pi_")) return id;
    }
  }
  const attrs = (data?.attributes as Record<string, unknown>) ?? {};
  for (const key of ["payment_intent", "paymentIntent"]) {
    const embedded = attrs[key];
    if (typeof embedded === "string" && embedded.startsWith("pi_")) return embedded;
    if (embedded && typeof embedded === "object") {
      const id = (embedded as { id?: string }).id;
      if (typeof id === "string" && id.startsWith("pi_")) return id;
    }
  }
  const included = (json.included as Array<{ id: string; type: string }>) ?? [];
  for (const i of included) {
    if (i.id?.startsWith("pi_")) {
      const t = (i.type ?? "").toLowerCase();
      if (t.includes("intent")) return i.id;
    }
  }
  return null;
}

/**
 * Checkout sessions (and intents) can list several `pay_` records (failed / abandoned attempts + the
 * successful capture). Refunds must use the **paid** payment — the same ID PayMongo shows on the
 * payment detail page — not the first ID embedded in the session.
 */
async function preferPaidRefundPaymentIds(candidateIds: string[]): Promise<string[]> {
  const unique = [...new Set(candidateIds.filter((id) => id.startsWith("pay_")))];
  if (unique.length === 0) return [];
  if (unique.length === 1) return unique;

  type Row = { id: string; paid: boolean; t: number };
  const rows: Row[] = [];
  await Promise.all(
    unique.map(async (id) => {
      const p = await retrievePayment(id);
      if (!p) return;
      const s = (p.attributes?.status ?? "").toLowerCase();
      const src = (p.attributes?.source as { status?: string } | undefined)?.status?.toLowerCase();
      const paid = isPaidStatus(s) || isPaidStatus(src);
      const attrs = p.attributes as Record<string, unknown> | undefined;
      const t =
        Date.parse(String(attrs?.paid_at ?? attrs?.created_at ?? attrs?.updated_at ?? "")) || 0;
      rows.push({ id: p.id, paid, t });
    })
  );
  const paidRows = rows.filter((r) => r.paid).sort((a, b) => b.t - a.t);
  if (paidRows.length > 0) return paidRows.map((r) => r.id);
  return unique;
}

/**
 * Resolve `pay_xxx` payment resource IDs (used in PayMongo dashboard / refunds) from the ID we store
 * on `payments.paymongo_id` (`cs_` checkout session or `link_` payment link).
 */
export async function resolvePaymongoRefundPaymentIds(paymongoId: string): Promise<string[]> {
  const secret = await getPaymongoSecretKey();
  if (!secret || !paymongoId) return [];

  const auth = `Basic ${Buffer.from(secret + ":").toString("base64")}`;
  const isCs = paymongoId.startsWith("cs_");
  const path = isCs ? `checkout_sessions/${paymongoId}` : `links/${paymongoId}`;

  async function fetchResource(include: string): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${PAYMONGO_BASE}/${path}?include=${include}`, {
      headers: { Authorization: auth },
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  }

  const json =
    (await fetchResource("payments,payment_intent")) ??
    (await fetchResource("payments")) ??
    (await fetchResource("payment_intent"));

  if (!json) return [];

  const candidateSet = new Set<string>();
  for (const id of extractPaymentIdsFromPaymongoResourceJson(json)) candidateSet.add(id);

  if (isCs) {
    const pi = extractPaymentIntentIdFromPaymongoResourceJson(json);
    if (pi) {
      const piRes = await fetch(`${PAYMONGO_BASE}/payment_intents/${pi}?include=payments`, {
        headers: { Authorization: auth },
      });
      if (piRes.ok) {
        const piJson = (await piRes.json()) as Record<string, unknown>;
        for (const id of extractPaymentIdsFromPaymongoResourceJson(piJson)) candidateSet.add(id);
      }
    }
  }

  const merged = [...candidateSet];
  if (merged.length === 0) return [];
  return preferPaidRefundPaymentIds(merged);
}

export type PaymongoRefundReason =
  | "duplicate"
  | "fraudulent"
  | "requested_by_customer";

export type CreatePaymongoRefundOk = {
  ok: true;
  refund_id: string;
  status?: string | null;
  raw?: unknown;
};

export type CreatePaymongoRefundErr = {
  ok: false;
  status: number;
  message: string;
};

/**
 * POST /v1/refunds — refund a captured payment (`pay_…`).
 * `amount` is in smallest currency unit (centavos for PHP).
 */
export async function createPaymongoRefund(params: {
  paymentId: string;
  amountCents: number;
  reason: PaymongoRefundReason;
  notes?: string;
}): Promise<CreatePaymongoRefundOk | CreatePaymongoRefundErr> {
  const secret = await getPaymongoSecretKey();
  if (!secret) {
    return { ok: false, status: 500, message: "PayMongo secret not configured" };
  }

  const attrs: Record<string, unknown> = {
    payment_id: params.paymentId,
    amount: Math.round(params.amountCents),
    reason: params.reason,
  };
  const notes = params.notes?.trim();
  if (notes) attrs.notes = notes.slice(0, 255);

  const res = await fetch(`${PAYMONGO_BASE}/refunds`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`,
      "Content-Type": "application/json",
    },
    // JSON:API requires `type` on create; omitting it returns 400 from PayMongo.
    body: JSON.stringify({ data: { type: "refund", attributes: attrs } }),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errors = (json as { errors?: Array<{ detail?: string; title?: string }> }).errors;
    const first = Array.isArray(errors) ? errors[0] : undefined;
    const detail =
      (typeof first?.detail === "string" && first.detail) ||
      (typeof first?.title === "string" && first.title) ||
      (typeof (json as { message?: string }).message === "string"
        ? (json as { message: string }).message
        : null) ||
      res.statusText ||
      "PayMongo refund failed";
    return { ok: false, status: res.status, message: detail };
  }

  const data = (json as { data?: { id?: string; attributes?: { status?: string } } })?.data;
  const refundId = data?.id;
  if (!refundId || typeof refundId !== "string") {
    return {
      ok: false,
      status: 502,
      message: "Invalid PayMongo refund response",
    };
  }

  return {
    ok: true,
    refund_id: refundId,
    status: data.attributes?.status ?? null,
    raw: json,
  };
}

export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return signature === expected;
}
