"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";
import {
  computePromoCalculator,
  type PromoCalculatorComputed,
  type PromoCalculatorConfig,
  type PromoCalculatorDiscountRow,
  type PromoCalculatorExpenseRow,
  type PromoCalculatorGiveawayRow,
  type PromoCalculatorSection,
} from "@/lib/promo-calculator";

interface PromoCalculatorTabProps {
  eventId: string;
}

interface PromoCalculatorResponse {
  sections: PromoCalculatorSection[];
  config: PromoCalculatorConfig;
  computed: PromoCalculatorComputed;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function createClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function centsFromPhpInput(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100));
}

function phpInputFromCents(cents: number): string {
  return (Math.max(0, cents) / 100).toString();
}

function clampWholeNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function PromoCalculatorTab({ eventId }: PromoCalculatorTabProps) {
  const [sections, setSections] = useState<PromoCalculatorSection[]>([]);
  const [config, setConfig] = useState<PromoCalculatorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/promo-calculator`, {
        cache: "no-store",
      });
      const data = (await res.json()) as PromoCalculatorResponse & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load promo calculator");
        return;
      }
      setSections(data.sections ?? []);
      setConfig(data.config);
    } catch {
      toast.error("Failed to load promo calculator");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const computed = useMemo(
    () => (config ? computePromoCalculator(sections, config) : null),
    [config, sections]
  );

  const updateGiveawayRow = useCallback((rowId: string, updater: (row: PromoCalculatorGiveawayRow) => PromoCalculatorGiveawayRow) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            giveaways: prev.giveaways.map((row) => (row.id === rowId ? updater(row) : row)),
          }
        : prev
    );
  }, []);

  const updateDiscountRow = useCallback((rowId: string, updater: (row: PromoCalculatorDiscountRow) => PromoCalculatorDiscountRow) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            discounts: prev.discounts.map((row) => (row.id === rowId ? updater(row) : row)),
          }
        : prev
    );
  }, []);

  const updateExpenseRow = useCallback((rowId: string, updater: (row: PromoCalculatorExpenseRow) => PromoCalculatorExpenseRow) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            expenses: prev.expenses.map((row) => (row.id === rowId ? updater(row) : row)),
          }
        : prev
    );
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/promo-calculator`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = (await res.json()) as PromoCalculatorResponse & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save promo calculator");
        return;
      }
      if (data.config) {
        setConfig(data.config);
      }
      toast.success("Promo calculator saved.");
    } catch {
      toast.error("Failed to save promo calculator");
    } finally {
      setSaving(false);
    }
  }

  const promoProgress = useMemo(() => {
    if (saving) {
      return {
        message: "Saving promo calculator",
        subtitle: "This event",
        detail: FLOATING_PROGRESS_PRESETS.genericSave.detail,
      };
    }
    if (loading) {
      return {
        message: "Loading promo calculator",
        subtitle: "This event",
        detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
      };
    }
    return {
      message: "Working…",
      subtitle: "Promo calculator",
      detail: FLOATING_PROGRESS_PRESETS.genericLoad.detail,
    };
  }, [loading, saving]);

  if (loading || !config || !computed) {
    return (
      <>
        <FloatingProgressBar
          active={loading || saving}
          message={promoProgress.message}
          subtitle={promoProgress.subtitle}
          detail={promoProgress.detail}
        />
        <div className="border border-[var(--glass-border)] bg-transparent p-6 text-foreground-muted">
          Loading promo calculator…
        </div>
      </>
    );
  }

  const { totals, sections: sectionSummaries } = computed;

  return (
    <div className="space-y-4">
      <FloatingProgressBar
        active={loading || saving}
        message={promoProgress.message}
        subtitle={promoProgress.subtitle}
        detail={promoProgress.detail}
      />

      <div className="border border-[var(--glass-border)] bg-transparent overflow-hidden">
        <div className="border-b border-[var(--glass-border)] bg-transparent px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Promo Calculator</h2>
          <p className="text-sm text-foreground-muted mt-1">
            Derived from current event sections and pricing, with saved promo worksheet inputs per event.
          </p>
        </div>
        <div className="p-4 space-y-4">
        <div className="rounded-md border border-yellow-400/60 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          <span className="font-semibold">Promo Calculator is in beta.</span>{" "}
          Calculations and layout may still change; double-check numbers before using them for
          final budgets or external reports.
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">
                Promo Budget (%)
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={config.promoBudgetPercent}
                onChange={(e) =>
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          promoBudgetPercent: Math.min(100, clampWholeNumber(e.target.value)),
                        }
                      : prev
                  )
                }
                className="w-32"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-[var(--glass-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5">
                <th className="px-3 py-2 text-left">Metric</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--glass-border)]/60">
                <td className="px-3 py-2 text-foreground">Total Projected Sales</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(totals.totalProjectedSalesCents)}</td>
                <td className="px-3 py-2 text-foreground-muted">Before promo deductions</td>
              </tr>
              <tr className="border-b border-[var(--glass-border)]/60">
                <td className="px-3 py-2 text-foreground">Promo Budget Allocation</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(totals.totalPromoBudgetCents)}</td>
                <td className="px-3 py-2 text-foreground-muted">Based on Promo Budget %</td>
              </tr>
              <tr className="border-b border-[var(--glass-border)]/60">
                <td className="px-3 py-2 text-foreground">Used Promo Budget</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(totals.totalUsedPromoBudgetCents)}</td>
                <td className="px-3 py-2 text-foreground-muted">Giveaways + discounts + other expenses</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-foreground">Remaining Promo Budget</td>
                <td className="px-3 py-2 text-right font-semibold text-foreground">{formatCurrency(totals.totalRemainingPromoBudgetCents)}</td>
                <td className="px-3 py-2 text-foreground-muted">Available for new promo spend</td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>

      <div className="border border-[var(--glass-border)] bg-transparent overflow-hidden">
        <div className="border-b border-[var(--glass-border)] bg-transparent px-3 py-2">
          <h3 className="text-base font-semibold text-foreground">Section Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5">
                <th className="px-2 py-3 text-left">Tier</th>
                <th className="px-2 py-3 text-right">For Sale</th>
                <th className="px-2 py-3 text-right">After Giveaways</th>
                <th className="px-2 py-3 text-right">Discounted Tickets</th>
                <th className="px-2 py-3 text-right">Ticket Price</th>
                <th className="px-2 py-3 text-right">Projected Sales</th>
                <th className="px-2 py-3 text-right">Giveaway Value</th>
                <th className="px-2 py-3 text-right">Discount Value</th>
              </tr>
            </thead>
            <tbody>
              {sectionSummaries.map((row) => (
                <tr key={row.sectionId} className="border-b border-[var(--glass-border)]/50">
                  <td className="px-2 py-3 text-foreground">{row.sectionName}</td>
                  <td className="px-2 py-3 text-right text-foreground">{row.forSale}</td>
                  <td className="px-2 py-3 text-right text-foreground">{row.forSaleAfterGiveaways}</td>
                  <td className="px-2 py-3 text-right text-foreground">{row.discountedTickets}</td>
                  <td className="px-2 py-3 text-right text-foreground">{formatCurrency(row.priceCents)}</td>
                  <td className="px-2 py-3 text-right text-foreground">{formatCurrency(row.projectedSalesCents)}</td>
                  <td className="px-2 py-3 text-right text-foreground-muted">{formatCurrency(row.giveawayValueCents)}</td>
                  <td className="px-2 py-3 text-right text-foreground-muted">{formatCurrency(row.discountValueCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--glass-border)] font-medium">
                <td className="px-2 py-3 text-foreground">Total</td>
                <td className="px-2 py-3 text-right text-foreground">{totals.totalCapacity}</td>
                <td className="px-2 py-3 text-right text-foreground">{totals.totalForSaleAfterGiveaways}</td>
                <td className="px-2 py-3 text-right text-foreground">{totals.totalDiscountedTickets}</td>
                <td className="px-2 py-3 text-right text-foreground">-</td>
                <td className="px-2 py-3 text-right text-foreground">{formatCurrency(totals.totalProjectedSalesCents)}</td>
                <td className="px-2 py-3 text-right text-foreground-muted">{formatCurrency(totals.totalGiveawayValueCents)}</td>
                <td className="px-2 py-3 text-right text-foreground-muted">{formatCurrency(totals.totalDiscountValueCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="border border-[var(--glass-border)] bg-transparent overflow-hidden">
        <div className="border-b border-[var(--glass-border)] bg-transparent px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Giveaway Tickets</h3>
            <p className="text-sm text-foreground-muted">
              Enter giveaway ticket counts by section and category.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      giveaways: [
                        ...prev.giveaways,
                        {
                          id: createClientId("giveaway"),
                          label: "New Giveaway",
                          allocations: Object.fromEntries(
                            sections.map((section) => [section.sectionId, 0])
                          ),
                        },
                      ],
                    }
                  : prev
              )
            }
          >
            <Plus className="h-4 w-4" />
            Add Giveaway
          </Button>
        </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5">
                <th className="px-2 py-3 text-left">Category</th>
                {sections.map((section) => (
                  <th key={section.sectionId} className="px-2 py-3 text-right">
                    {section.sectionName}
                  </th>
                ))}
                <th className="px-2 py-3 text-right">Total Tickets</th>
                <th className="px-2 py-3 text-right">Value</th>
                <th className="px-2 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {config.giveaways.map((row) => {
                const totalTickets = sections.reduce(
                  (sum, section) => sum + (row.allocations[section.sectionId] ?? 0),
                  0
                );
                const totalValue = sections.reduce(
                  (sum, section) =>
                    sum + (row.allocations[section.sectionId] ?? 0) * section.priceCents,
                  0
                );
                return (
                  <tr key={row.id} className="border-b border-[var(--glass-border)]/50">
                    <td className="px-2 py-3">
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          updateGiveawayRow(row.id, (current) => ({
                            ...current,
                            label: e.target.value,
                          }))
                        }
                      />
                    </td>
                    {sections.map((section) => (
                      <td key={section.sectionId} className="px-2 py-3">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.allocations[section.sectionId] ?? 0}
                          onChange={(e) =>
                            updateGiveawayRow(row.id, (current) => ({
                              ...current,
                              allocations: {
                                ...current.allocations,
                                [section.sectionId]: clampWholeNumber(e.target.value),
                              },
                            }))
                          }
                          className="text-right"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right text-foreground">{totalTickets}</td>
                    <td className="px-2 py-3 text-right text-foreground-muted">
                      {formatCurrency(totalValue)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  giveaways: prev.giveaways.filter((item) => item.id !== row.id),
                                }
                              : prev
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-[var(--glass-border)] bg-transparent overflow-hidden">
        <div className="border-b border-[var(--glass-border)] bg-transparent px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Discounted Tickets</h3>
            <p className="text-sm text-foreground-muted">
              Define ticket counts and discount percentages by promo bucket.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      discounts: [
                        ...prev.discounts,
                        {
                          id: createClientId("discount"),
                          label: "New Discount",
                          discountPercent: 10,
                          allocations: Object.fromEntries(
                            sections.map((section) => [section.sectionId, 0])
                          ),
                        },
                      ],
                    }
                  : prev
              )
            }
          >
            <Plus className="h-4 w-4" />
            Add Discount
          </Button>
        </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5">
                <th className="px-2 py-3 text-left">Category</th>
                <th className="px-2 py-3 text-right">Discount %</th>
                {sections.map((section) => (
                  <th key={section.sectionId} className="px-2 py-3 text-right">
                    {section.sectionName}
                  </th>
                ))}
                <th className="px-2 py-3 text-right">Total Tickets</th>
                <th className="px-2 py-3 text-right">Discount Value</th>
                <th className="px-2 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {config.discounts.map((row) => {
                const totalTickets = sections.reduce(
                  (sum, section) => sum + (row.allocations[section.sectionId] ?? 0),
                  0
                );
                const totalValue = sections.reduce(
                  (sum, section) =>
                    sum +
                    Math.round(
                      (row.allocations[section.sectionId] ?? 0) *
                        section.priceCents *
                        (row.discountPercent / 100)
                    ),
                  0
                );
                return (
                  <tr key={row.id} className="border-b border-[var(--glass-border)]/50">
                    <td className="px-2 py-3">
                      <Input
                        value={row.label}
                        onChange={(e) =>
                          updateDiscountRow(row.id, (current) => ({
                            ...current,
                            label: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="px-2 py-3">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={row.discountPercent}
                        onChange={(e) =>
                          updateDiscountRow(row.id, (current) => ({
                            ...current,
                            discountPercent: Math.min(100, clampWholeNumber(e.target.value)),
                          }))
                        }
                        className="text-right"
                      />
                    </td>
                    {sections.map((section) => (
                      <td key={section.sectionId} className="px-2 py-3">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.allocations[section.sectionId] ?? 0}
                          onChange={(e) =>
                            updateDiscountRow(row.id, (current) => ({
                              ...current,
                              allocations: {
                                ...current.allocations,
                                [section.sectionId]: clampWholeNumber(e.target.value),
                              },
                            }))
                          }
                          className="text-right"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right text-foreground">{totalTickets}</td>
                    <td className="px-2 py-3 text-right text-foreground-muted">
                      {formatCurrency(totalValue)}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setConfig((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  discounts: prev.discounts.filter((item) => item.id !== row.id),
                                }
                              : prev
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-[var(--glass-border)] bg-transparent overflow-hidden">
        <div className="border-b border-[var(--glass-border)] bg-transparent px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Other Promo Expenses</h3>
            <p className="text-sm text-foreground-muted">
              Track non-ticket promo costs that also consume the promo budget.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() =>
              setConfig((prev) =>
                prev
                  ? {
                      ...prev,
                      expenses: [
                        ...prev.expenses,
                        {
                          id: createClientId("expense"),
                          label: "New Expense",
                          amountCents: 0,
                        },
                      ],
                    }
                  : prev
              )
            }
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </Button>
        </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] bg-white/5">
                <th className="px-2 py-3 text-left">Expense</th>
                <th className="px-2 py-3 text-right">Amount (PHP)</th>
                <th className="px-2 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {config.expenses.map((row) => (
                <tr key={row.id} className="border-b border-[var(--glass-border)]/50">
                  <td className="px-2 py-3">
                    <Input
                      value={row.label}
                      onChange={(e) =>
                        updateExpenseRow(row.id, (current) => ({
                          ...current,
                          label: e.target.value,
                        }))
                      }
                    />
                  </td>
                  <td className="px-2 py-3">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={phpInputFromCents(row.amountCents)}
                      onChange={(e) =>
                        updateExpenseRow(row.id, (current) => ({
                          ...current,
                          amountCents: centsFromPhpInput(e.target.value),
                        }))
                      }
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setConfig((prev) =>
                          prev
                            ? {
                                ...prev,
                                expenses: prev.expenses.filter((item) => item.id !== row.id),
                              }
                            : prev
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--glass-border)] font-medium">
                <td className="px-2 py-3 text-foreground">Total Other Expenses</td>
                <td className="px-2 py-3 text-right text-foreground">
                  {formatCurrency(totals.totalExpensesCents)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void handleSave()} className="gap-2">
          <Save className="h-4 w-4" />
          Save All Changes
        </Button>
      </div>
    </div>
  );
}
