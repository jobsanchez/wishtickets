import { z } from "zod";

export const SPECIAL_REQUEST_TYPES = [
  "none",
  "pwd",
  "senior_citizen",
  "pregnant",
  "others",
] as const;

export type SpecialRequestType = (typeof SPECIAL_REQUEST_TYPES)[number];

export const SPECIAL_REQUEST_LABELS: Record<SpecialRequestType, string> = {
  none: "No special request",
  pwd: "PWD (Person With Disability)",
  senior_citizen: "Senior Citizen",
  pregnant: "Pregnant",
  others: "Others",
};

/** Shown for legacy DB values before `with_companion` was removed. */
const LEGACY_SPECIAL_REQUEST_LABELS: Record<string, string> = {
  with_companion: "With Companion (legacy booking)",
};

export const SPECIAL_REQUEST_DETAILS_MAX = 2000;

export const specialRequestFieldsSchema = z.object({
  special_request_type: z.enum(SPECIAL_REQUEST_TYPES),
  special_request_details: z.string().max(SPECIAL_REQUEST_DETAILS_MAX).optional(),
});

export function specialRequestRefine(
  data: z.infer<typeof specialRequestFieldsSchema>,
  ctx: z.RefinementCtx
) {
  const d = (data.special_request_details ?? "").trim();
  if (data.special_request_type === "others" && !d) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Please enter notes for this option.",
      path: ["special_request_details"],
    });
  }
}

/** Nullable column value: empty or whitespace becomes null. */
export function specialRequestDetailsForStorage(details: string | undefined): string | null {
  const t = (details ?? "").trim();
  if (!t) return null;
  return t;
}

export function specialRequestTypeLabel(
  type: string | null | undefined
): string {
  if (type && type in SPECIAL_REQUEST_LABELS) {
    return SPECIAL_REQUEST_LABELS[type as SpecialRequestType];
  }
  if (type && type in LEGACY_SPECIAL_REQUEST_LABELS) {
    return LEGACY_SPECIAL_REQUEST_LABELS[type];
  }
  return "Special request";
}
