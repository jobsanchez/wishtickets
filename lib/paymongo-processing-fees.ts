import type { PaymongoMethodId } from "@/lib/paymongo-methods";

/** Buyer-facing payment bucket (subset of PayMongo rails). */
export const PAYMONGO_PAYMENT_BUCKETS = ["qrph", "ewallet", "card", "banks"] as const;
export type PaymongoPaymentBucket = (typeof PAYMONGO_PAYMENT_BUCKETS)[number];

export type PaymongoFeeModel = "percent_plus_fixed" | "max_of_percent_or_fixed";

export type PaymongoBucketFeeConfig = {
  percent: number;
  fixed_cents: number;
  fee_model: PaymongoFeeModel;
};

export type PaymongoProcessingFeesConfig = Record<PaymongoPaymentBucket, PaymongoBucketFeeConfig>;

/** PayMongo method IDs per bucket (before intersecting with globally enabled methods). */
export const PAYMONGO_BUCKET_METHODS: Record<PaymongoPaymentBucket, PaymongoMethodId[]> = {
  qrph: ["qrph"],
  ewallet: ["gcash", "grab_pay", "paymaya", "shopee_pay"],
  card: ["card"],
  banks: ["dob", "dob_ubp"],
};

export const PAYMONGO_BUCKET_LABELS: Record<PaymongoPaymentBucket, string> = {
  qrph: "QR PH",
  ewallet: "E-Wallet",
  card: "Cards (Visa / Mastercard)",
  banks: "Direct debit / banks",
};

/** Defaults aligned with product plan (conservative cushions vs PayMongo list pricing). */
export const DEFAULT_PAYMONGO_PROCESSING_FEES: PaymongoProcessingFeesConfig = {
  qrph: { percent: 0.015, fixed_cents: 0, fee_model: "percent_plus_fixed" },
  ewallet: { percent: 0.025, fixed_cents: 0, fee_model: "percent_plus_fixed" },
  card: { percent: 0.035, fixed_cents: 1500, fee_model: "percent_plus_fixed" },
  banks: { percent: 0.008, fixed_cents: 1500, fee_model: "max_of_percent_or_fixed" },
};

function clampPercent(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampFixedCents(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 100_000_000);
}

function parseFeeModel(raw: unknown): PaymongoFeeModel {
  if (raw === "max_of_percent_or_fixed") return "max_of_percent_or_fixed";
  return "percent_plus_fixed";
}

function mergeBucket(
  bucket: PaymongoPaymentBucket,
  partial: unknown
): PaymongoBucketFeeConfig {
  const base = DEFAULT_PAYMONGO_PROCESSING_FEES[bucket];
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    return { ...base };
  }
  const o = partial as Record<string, unknown>;
  return {
    percent: clampPercent(o.percent ?? base.percent),
    fixed_cents: clampFixedCents(o.fixed_cents ?? base.fixed_cents),
    fee_model: parseFeeModel(o.fee_model ?? base.fee_model),
  };
}

/** Normalize stored JSON into a full fee config with safe defaults. */
export function parsePaymongoProcessingFees(raw: unknown): PaymongoProcessingFeesConfig {
  const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    qrph: mergeBucket("qrph", root.qrph),
    ewallet: mergeBucket("ewallet", root.ewallet),
    card: mergeBucket("card", root.card),
    banks: mergeBucket("banks", root.banks),
  };
}

const SURCHARGE_EPS = 1e-9;

/** ⌈N × p⌉ in centavos; conservative so we never under-count fractional centavos from floats. */
function percentSurchargeOnNetCents(netCents: number, p: number): number {
  if (p <= 0) return 0;
  return Math.ceil(netCents * p - SURCHARGE_EPS);
}

/**
 * Net ticket total N (centavos, after promos). Returns what the buyer pays on PayMongo.
 *
 * **Additive model:** charged = N + surcharge. Percent applies to **net** (not to the final total).
 * - `percent_plus_fixed`: surcharge = ⌈N × p⌉ + fixed_cents
 * - `max_of_percent_or_fixed`: surcharge = max(⌈N × p⌉, fixed_cents)
 */
export function computeChargedCentsForBucket(
  ticketNetCents: number,
  bucket: PaymongoPaymentBucket,
  fees: PaymongoProcessingFeesConfig
): number {
  const N = Math.max(0, Math.floor(ticketNetCents));
  if (N === 0) return 0;
  const cfg = fees[bucket];
  const p = cfg.percent;

  if (cfg.fee_model === "max_of_percent_or_fixed") {
    const F = cfg.fixed_cents;
    if (p >= 1) return N + F;
    const fromPercent = percentSurchargeOnNetCents(N, p);
    return N + Math.max(fromPercent, F);
  }

  const c = cfg.fixed_cents;
  if (p >= 1) return N + c;
  return N + percentSurchargeOnNetCents(N, p) + c;
}

/** Intersects bucket methods with globally enabled PayMongo methods. */
export function resolvePaymongoMethodsForBucket(
  bucket: PaymongoPaymentBucket,
  enabledMethods: PaymongoMethodId[]
): PaymongoMethodId[] {
  const allow = new Set(enabledMethods);
  return PAYMONGO_BUCKET_METHODS[bucket].filter((m) => allow.has(m));
}

/** Serialize config for API (same shape as stored JSON). */
export function serializePaymongoProcessingFees(fees: PaymongoProcessingFeesConfig): PaymongoProcessingFeesConfig {
  return {
    qrph: { ...fees.qrph },
    ewallet: { ...fees.ewallet },
    card: { ...fees.card },
    banks: { ...fees.banks },
  };
}
