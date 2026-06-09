"use client";

import { useState } from "react";
import type { DashboardKPIs } from "@/hooks/use-dashboard-data";
import type { SectionSales, VssBreakdown } from "@/hooks/use-dashboard-data";
import type { DashboardPromoBudget } from "@/hooks/use-dashboard-data";
import type { DrilldownMetric } from "@/hooks/use-drilldown-data";
import {
  KpiDetailModal,
  buildExistingDataForCapacity,
  buildExistingDataForSold,
  buildExistingDataForOccupancy,
} from "./kpi-detail-modal";

interface KPICardsProps {
  kpis: DashboardKPIs;
  eventId: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  promoBudget?: DashboardPromoBudget;
  sectionsSales: SectionSales[];
  vssBreakdown: VssBreakdown[];
  canRelease?: boolean;
  canDeleteAdmissions?: boolean;
  canClearSoldSection?: boolean;
  disableDrilldown?: boolean;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatPercent(n: number): string {
  return n.toFixed(1) + "%";
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type CardMetric = DrilldownMetric | "projected_gross" | "amount_paid" | "promo_budget" | "tech_hold";

const CARD_CONFIG: Array<{ label: string; metric: CardMetric }> = [
  { label: "Total Capacity", metric: "capacity" },
  { label: "Online Sales", metric: "sold" },
  { label: "Potential Sales", metric: "projected_gross" },
  { label: "Total Sales", metric: "amount_paid" },
  { label: "Used Promo Budget", metric: "promo_budget" },
  { label: "Tech Hold Seats", metric: "tech_hold" },
  { label: "Distributed Tickets", metric: "distributed" },
  { label: "Complimentary Tickets", metric: "complimentary" },
  { label: "Admitted Tickets", metric: "admitted" },
  { label: "Overall Occupancy %", metric: "occupancy" },
];

function getValueParts(
  kpis: DashboardKPIs,
  metric: CardMetric,
  promoBudget?: DashboardPromoBudget
): { main: string; percent: string | null } {
  switch (metric) {
    case "promo_budget": {
      const used = promoBudget?.used_cents ?? 0;
      const allocated = promoBudget?.allocated_cents ?? 0;
      return { main: `${formatCurrency(used)} `, percent: `(of ${formatCurrency(allocated)})` };
    }
    case "tech_hold": {
      const holdCount = kpis.tech_hold_seats ?? 0;
      const holdValue = kpis.tech_hold_value_cents ?? 0;
      return { main: `${formatNumber(holdCount)} `, percent: `(${formatCurrency(holdValue)})` };
    }
    case "capacity":
      return { main: formatNumber(kpis.total_capacity), percent: null };
    case "projected_gross":
      return { main: formatCurrency(kpis.total_projected_revenue_cents ?? kpis.projected_total_gross_cents ?? kpis.gross_revenue_cents), percent: null };
    case "amount_paid": {
      const totalProjected = kpis.total_projected_revenue_cents ?? kpis.projected_total_gross_cents ?? 0;
      const pct =
        totalProjected > 0
          ? ((kpis.gross_revenue_cents / totalProjected) * 100).toFixed(1)
          : "0";
      return { main: formatCurrency(kpis.gross_revenue_cents) + " ", percent: `(${pct}%)` };
    }
    case "sold": {
      const soldPct =
        kpis.total_capacity > 0 ? ((kpis.total_sold / kpis.total_capacity) * 100).toFixed(1) : "0";
      return { main: formatNumber(kpis.total_sold) + " ", percent: `(${soldPct}%)` };
    }
    case "distributed": {
      const distPct =
        kpis.total_capacity > 0 ? ((kpis.distributed / kpis.total_capacity) * 100).toFixed(1) : "0";
      return { main: formatNumber(kpis.distributed) + " ", percent: `(${distPct}%)` };
    }
    case "complimentary": {
      const compPct =
        kpis.total_capacity > 0
          ? ((kpis.complimentary / kpis.total_capacity) * 100).toFixed(1)
          : "0";
      return { main: formatNumber(kpis.complimentary) + " ", percent: `(${compPct}%)` };
    }
    case "admitted": {
      const admPct =
        kpis.total_capacity > 0 ? ((kpis.admitted / kpis.total_capacity) * 100).toFixed(1) : "0";
      return { main: formatNumber(kpis.admitted) + " ", percent: `(${admPct}%)` };
    }
    case "occupancy":
      return { main: "", percent: formatPercent(kpis.occupancy_pct) };
    default:
      return { main: "", percent: null };
  }
}

function getExistingData(
  metric: DrilldownMetric,
  sectionsSales: SectionSales[],
  vssBreakdown: VssBreakdown[]
): { rows: Record<string, unknown>[] } | undefined {
  switch (metric) {
    case "capacity":
      return buildExistingDataForCapacity(sectionsSales);
    case "sold":
      return buildExistingDataForSold(sectionsSales);
    case "occupancy":
      return buildExistingDataForOccupancy(vssBreakdown);
    default:
      return undefined;
  }
}

export function KPICards({
  kpis,
  eventId,
  dateFrom,
  dateTo,
  promoBudget,
  sectionsSales,
  vssBreakdown,
  canRelease = false,
  canDeleteAdmissions = false,
  canClearSoldSection = false,
  disableDrilldown = false,
}: KPICardsProps) {
  const [openModal, setOpenModal] = useState<DrilldownMetric | null>(null);

  return (
    <>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-4">
        {CARD_CONFIG.map(({ label, metric }) => (
          <button
            key={metric}
            type="button"
            onClick={() => {
              if (disableDrilldown || metric === "promo_budget" || metric === "tech_hold") return;
              setOpenModal(
                metric === "projected_gross" || metric === "amount_paid"
                  ? "revenue"
                  : metric
              );
            }}
            className={`glass rounded-xl border border-[var(--glass-border)] p-6 text-left transition-colors ${
              disableDrilldown
                ? "cursor-default"
                : "hover:bg-white/5 [html[data-theme=light]_&]:hover:bg-black/[0.03] cursor-pointer"
            }`}
          >
            <p className="text-sm text-green-300 [html[data-theme=light]_&]:text-emerald-700">{label}</p>
            <p className="text-2xl font-bold mt-1">
              {(() => {
                const { main, percent } = getValueParts(kpis, metric, promoBudget);
                return (
                  <>
                    {main && <span className="text-foreground">{main}</span>}
                    {percent && (
                      <span className="text-yellow-400 [html[data-theme=light]_&]:text-amber-600">
                        {percent}
                      </span>
                    )}
                  </>
                );
              })()}
            </p>
            {metric === "promo_budget" && (
              <p className="mt-1 text-xs text-foreground-muted">
                Allocated {promoBudget?.promo_budget_percent ?? 10}% of potential sales
              </p>
            )}
          </button>
        ))}
      </div>
      {!disableDrilldown && openModal && (
        <KpiDetailModal
          metric={openModal}
          title={
            openModal === "revenue"
              ? "Revenue"
              : (CARD_CONFIG.find((c) => c.metric === openModal)?.label ?? String(openModal))
          }
          distributedRecipientNames={kpis.distributed_recipient_names ?? null}
          eventId={eventId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          open={!!openModal}
          onOpenChange={(open) => !open && setOpenModal(null)}
          existingData={
            ["capacity", "sold", "occupancy"].includes(openModal)
              ? getExistingData(openModal as "capacity" | "sold" | "occupancy", sectionsSales, vssBreakdown)
              : undefined
          }
          canRelease={canRelease}
          canDeleteAdmissions={canDeleteAdmissions}
          canClearSoldSection={canClearSoldSection}
        />
      )}
    </>
  );
}
