import type { SectionSales } from "@/hooks/use-dashboard-data";

/** Synthetic VSS row for tickets that could not be mapped to a section. */
export const VSS_UNMAPPED_SECTION_ID = "00000000-0000-0000-0000-000000000002";

function isChartSection(row: SectionSales): boolean {
  return (
    row.section_id !== VSS_UNMAPPED_SECTION_ID && row.section_name !== "Unmapped"
  );
}

/** sold_pct = share of online ticket sales (not % of capacity). Keeps all non-unmapped sections. */
export function applyOnlineSalesSharePct(data: SectionSales[]): SectionSales[] {
  const eligible = data.filter(isChartSection);
  const totalOnlineSold = eligible.reduce((sum, d) => sum + d.sold_count, 0);
  return eligible
    .map((d) => ({
      ...d,
      sold_pct:
        totalOnlineSold > 0 && d.sold_count > 0
          ? Number(((d.sold_count / totalOnlineSold) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.sold_pct - a.sold_pct);
}

/** Chart display: online share %, sections with at least one online sale only. */
export function sectionsOnlineSalesChartData(data: SectionSales[]): SectionSales[] {
  return applyOnlineSalesSharePct(data).filter((d) => d.sold_count > 0);
}

function soldInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

/** Align sections_sales with ticket-based VSS when available (admin + shared report API). */
export function buildSectionsSalesForReport(params: {
  groupedReport: Record<string, unknown>;
  vssBreakdownRows: Array<Record<string, unknown>>;
  useTicketVss: boolean;
}): SectionSales[] {
  const rpcSections = Array.isArray(params.groupedReport.sections_sales)
    ? (params.groupedReport.sections_sales as SectionSales[])
    : [];
  const capacityBySectionId = new Map(rpcSections.map((s) => [s.section_id, s.capacity]));
  const capacityByName = new Map(rpcSections.map((s) => [s.section_name, s.capacity]));

  if (params.useTicketVss && params.vssBreakdownRows.length > 0) {
    const fromVss: SectionSales[] = params.vssBreakdownRows
      .filter((row) => String(row.section_id ?? "") !== VSS_UNMAPPED_SECTION_ID)
      .map((row) => {
        const sectionId = String(row.section_id ?? "");
        const sectionName = String(row.section_name ?? "Other");
        const capFromRow =
          soldInt(row.sold) +
          soldInt(row.distributed) +
          soldInt(row.complimentary) +
          soldInt(row.available);
        return {
          section_id: sectionId,
          section_name: sectionName,
          section_color: (row.section_color as string | null) ?? null,
          capacity:
            capacityBySectionId.get(sectionId) ??
            capacityByName.get(sectionName) ??
            capFromRow,
          sold_count: soldInt(row.sold),
          sold_pct: 0,
        };
      });
    return applyOnlineSalesSharePct(fromVss);
  }

  return applyOnlineSalesSharePct(rpcSections);
}
