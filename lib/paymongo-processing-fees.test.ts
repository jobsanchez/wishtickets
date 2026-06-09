import { describe, expect, it } from "vitest";
import {
  computeChargedCentsForBucket,
  DEFAULT_PAYMONGO_PROCESSING_FEES,
  parsePaymongoProcessingFees,
} from "./paymongo-processing-fees";

describe("computeChargedCentsForBucket (additive surcharge on net)", () => {
  const fees = parsePaymongoProcessingFees(undefined);

  it("banks: 3000 PHP net + 0.8% = 3024 PHP (not fee-on-gross gross-up)", () => {
    expect(computeChargedCentsForBucket(300_000, "banks", fees)).toBe(302_400);
  });

  it("percent_plus_fixed adds percent-of-net and fixed", () => {
    const cfg = {
      ...DEFAULT_PAYMONGO_PROCESSING_FEES,
      card: { percent: 0.035, fixed_cents: 1500, fee_model: "percent_plus_fixed" as const },
    };
    // 300000 + ceil(10500) + 1500 = 312000
    expect(computeChargedCentsForBucket(300_000, "card", cfg)).toBe(312_000);
  });

  it("max model uses fixed when larger than percent-of-net", () => {
    const cfg = {
      ...DEFAULT_PAYMONGO_PROCESSING_FEES,
      banks: { percent: 0.001, fixed_cents: 15_000, fee_model: "max_of_percent_or_fixed" as const },
    };
    // ceil(300000 * 0.001) = 300; max(300, 15000) = 15000 → 315000
    expect(computeChargedCentsForBucket(300_000, "banks", cfg)).toBe(315_000);
  });
});
