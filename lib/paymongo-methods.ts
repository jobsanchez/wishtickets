export const PAYMONGO_METHOD_OPTIONS = [
  { id: "card", label: "Visa / Mastercard (Card)" },
  { id: "gcash", label: "GCash" },
  { id: "grab_pay", label: "GrabPay" },
  { id: "paymaya", label: "Maya" },
  { id: "shopee_pay", label: "ShopeePay" },
  { id: "qrph", label: "QRPh" },
  { id: "dob", label: "BPI Direct Debit" },
  { id: "dob_ubp", label: "UBP Direct Debit" },
] as const;

/** PayMongo list processing rates (decimal percent of net) for admin tuning reference. */
export const PAYMONGO_METHOD_LIST_FEES: Partial<Record<PaymongoMethodId, number>> = {
  gcash: 0.025,
  grab_pay: 0.02,
  paymaya: 0.02,
  shopee_pay: 0.017,
};

export type PaymongoMethodId = (typeof PAYMONGO_METHOD_OPTIONS)[number]["id"];

export const DEFAULT_PAYMONGO_METHODS: PaymongoMethodId[] = [
  "card",
  "gcash",
  "grab_pay",
  "paymaya",
  "shopee_pay",
  "qrph",
  "dob",
  "dob_ubp",
];

export const SAFE_FALLBACK_PAYMONGO_METHODS: PaymongoMethodId[] = [
  "card",
  "gcash",
  "grab_pay",
  "paymaya",
  "shopee_pay",
];

export const STRICT_CHECKOUT_PAYMONGO_METHODS: PaymongoMethodId[] = [
  "card",
  "gcash",
  "grab_pay",
  "paymaya",
  "shopee_pay",
];

const METHOD_SET = new Set<string>(PAYMONGO_METHOD_OPTIONS.map((m) => m.id));
const LEGACY_METHOD_ALIASES: Record<string, PaymongoMethodId> = {
  // Legacy/internal aliases seen in older app_config rows or external scripts.
  cards: "card",
  mastercard: "card",
  visa_mastercard: "card",
  grabpay: "grab_pay",
  maya: "paymaya",
  shopeepay: "shopee_pay",
  dob_bpi: "dob",
  bpi_direct_debit: "dob",
  ubp_direct_debit: "dob_ubp",
};

export function sanitizePaymongoMethods(input: unknown): PaymongoMethodId[] {
  if (!Array.isArray(input)) return [];
  const unique: PaymongoMethodId[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string") continue;
    const rawId = v.trim().toLowerCase();
    const id = LEGACY_METHOD_ALIASES[rawId] ?? rawId;
    if (!METHOD_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id as PaymongoMethodId);
  }
  return unique;
}

export function findUnsupportedStrictCheckoutMethods(
  methods: PaymongoMethodId[]
): PaymongoMethodId[] {
  const allowed = new Set<string>(STRICT_CHECKOUT_PAYMONGO_METHODS);
  return methods.filter((m) => !allowed.has(m));
}
