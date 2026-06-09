export interface PromoCalculatorSection {
  sectionId: string;
  sectionName: string;
  capacity: number;
  forSale?: number;
  priceCents: number;
}

export interface PromoCalculatorGiveawayRow {
  id: string;
  label: string;
  allocations: Record<string, number>;
}

export interface PromoCalculatorDiscountRow {
  id: string;
  label: string;
  discountPercent: number;
  allocations: Record<string, number>;
}

export interface PromoCalculatorExpenseRow {
  id: string;
  label: string;
  amountCents: number;
}

export interface PromoCalculatorConfig {
  promoBudgetPercent: number;
  giveaways: PromoCalculatorGiveawayRow[];
  discounts: PromoCalculatorDiscountRow[];
  expenses: PromoCalculatorExpenseRow[];
}

export interface PromoCalculatorSectionSummary extends PromoCalculatorSection {
  forSale: number;
  forSaleAfterGiveaways: number;
  discountedTickets: number;
  giveawayTickets: number;
  giveawayValueCents: number;
  discountValueCents: number;
  projectedSalesCents: number;
}

export interface PromoCalculatorTotals {
  totalCapacity: number;
  totalForSaleAfterGiveaways: number;
  totalDiscountedTickets: number;
  totalProjectedSalesCents: number;
  totalGiveawayValueCents: number;
  totalDiscountValueCents: number;
  totalExpensesCents: number;
  totalUsedPromoBudgetCents: number;
  totalPromoBudgetCents: number;
  totalRemainingPromoBudgetCents: number;
}

export interface PromoCalculatorComputed {
  sections: PromoCalculatorSectionSummary[];
  totals: PromoCalculatorTotals;
}

function asNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function clampPercent(value: unknown): number {
  return Math.min(100, asNonNegativeInt(value));
}

function normalizeAllocations(
  input: unknown,
  sectionIds: string[]
): Record<string, number> {
  const src =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const next: Record<string, number> = {};
  for (const sectionId of sectionIds) {
    next[sectionId] = asNonNegativeInt(src[sectionId]);
  }
  return next;
}

function normalizeId(id: unknown, fallback: string): string {
  return typeof id === "string" && id.trim() ? id : fallback;
}

function normalizeLabel(label: unknown, fallback: string): string {
  return typeof label === "string" && label.trim() ? label.trim() : fallback;
}

export function createDefaultPromoCalculatorConfig(
  sections: PromoCalculatorSection[]
): PromoCalculatorConfig {
  void sections;
  return {
    promoBudgetPercent: 10,
    giveaways: [],
    discounts: [],
    expenses: [],
  };
}

export function normalizePromoCalculatorConfig(
  rawConfig: unknown,
  sections: PromoCalculatorSection[]
): PromoCalculatorConfig {
  const defaults = createDefaultPromoCalculatorConfig(sections);
  const sectionIds = sections.map((s) => s.sectionId);
  const src =
    rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
      ? (rawConfig as Record<string, unknown>)
      : {};

  const giveaways = Array.isArray(src.giveaways)
    ? src.giveaways.map((row, index) => {
        const r =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : {};
        return {
          id: normalizeId(r.id, `giveaway-${index + 1}`),
          label: normalizeLabel(r.label, `Giveaway ${index + 1}`),
          allocations: normalizeAllocations(r.allocations, sectionIds),
        };
      })
    : defaults.giveaways;

  const discounts = Array.isArray(src.discounts)
    ? src.discounts.map((row, index) => {
        const r =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : {};
        return {
          id: normalizeId(r.id, `discount-${index + 1}`),
          label: normalizeLabel(r.label, `Discount ${index + 1}`),
          discountPercent: clampPercent(r.discountPercent),
          allocations: normalizeAllocations(r.allocations, sectionIds),
        };
      })
    : defaults.discounts;

  const expenses = Array.isArray(src.expenses)
    ? src.expenses.map((row, index) => {
        const r =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : {};
        return {
          id: normalizeId(r.id, `expense-${index + 1}`),
          label: normalizeLabel(r.label, `Expense ${index + 1}`),
          amountCents: asNonNegativeInt(r.amountCents),
        };
      })
    : defaults.expenses;

  return {
    promoBudgetPercent: clampPercent(src.promoBudgetPercent ?? defaults.promoBudgetPercent),
    giveaways,
    discounts,
    expenses,
  };
}

export function computePromoCalculator(
  sections: PromoCalculatorSection[],
  config: PromoCalculatorConfig
): PromoCalculatorComputed {
  const sectionSummaries: PromoCalculatorSectionSummary[] = sections.map((section) => {
    const forSaleBase = Math.max(0, asNonNegativeInt(section.forSale ?? section.capacity));
    const giveawayTickets = config.giveaways.reduce(
      (sum, row) => sum + asNonNegativeInt(row.allocations[section.sectionId]),
      0
    );
    const discountedTickets = config.discounts.reduce(
      (sum, row) => sum + asNonNegativeInt(row.allocations[section.sectionId]),
      0
    );
    const giveawayValueCents = giveawayTickets * section.priceCents;
    const discountValueCents = config.discounts.reduce((sum, row) => {
      const count = asNonNegativeInt(row.allocations[section.sectionId]);
      return sum + Math.round(count * section.priceCents * (clampPercent(row.discountPercent) / 100));
    }, 0);
    const projectedSalesCents = forSaleBase * section.priceCents;

    return {
      ...section,
      forSale: forSaleBase,
      forSaleAfterGiveaways: Math.max(0, forSaleBase - giveawayTickets),
      discountedTickets,
      giveawayTickets,
      giveawayValueCents,
      discountValueCents,
      projectedSalesCents,
    };
  });

  const totalExpensesCents = config.expenses.reduce(
    (sum, row) => sum + asNonNegativeInt(row.amountCents),
    0
  );
  const totalProjectedSalesCents = sectionSummaries.reduce(
    (sum, row) => sum + row.projectedSalesCents,
    0
  );
  const totalGiveawayValueCents = sectionSummaries.reduce(
    (sum, row) => sum + row.giveawayValueCents,
    0
  );
  const totalDiscountValueCents = sectionSummaries.reduce(
    (sum, row) => sum + row.discountValueCents,
    0
  );
  const totalPromoBudgetCents = Math.round(
    totalProjectedSalesCents * (clampPercent(config.promoBudgetPercent) / 100)
  );
  const totalUsedPromoBudgetCents =
    totalGiveawayValueCents + totalDiscountValueCents + totalExpensesCents;

  return {
    sections: sectionSummaries,
    totals: {
      totalCapacity: sectionSummaries.reduce((sum, row) => sum + row.forSale, 0),
      totalForSaleAfterGiveaways: sectionSummaries.reduce(
        (sum, row) => sum + row.forSaleAfterGiveaways,
        0
      ),
      totalDiscountedTickets: sectionSummaries.reduce(
        (sum, row) => sum + row.discountedTickets,
        0
      ),
      totalProjectedSalesCents,
      totalGiveawayValueCents,
      totalDiscountValueCents,
      totalExpensesCents,
      totalUsedPromoBudgetCents,
      totalPromoBudgetCents,
      totalRemainingPromoBudgetCents: totalPromoBudgetCents - totalUsedPromoBudgetCents,
    },
  };
}
