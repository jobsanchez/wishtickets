type EventSectionGroupRow = {
  id: string;
  name: string | null;
  section_code: string | null;
  section_group: string | null;
  sort_order: number | null;
  color: string | null;
};

export type SectionMaps = {
  byId: Map<string, EventSectionGroupRow>;
  byLabelKey: Map<string, EventSectionGroupRow>;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function keyOf(value: string | null | undefined): string {
  return clean(value).toLowerCase();
}

function fallbackLabel(sec: EventSectionGroupRow): string {
  const fromName = clean(sec.name);
  if (fromName) return fromName;
  const fromCode = clean(sec.section_code);
  if (fromCode) return fromCode;
  return "Other";
}

function groupedLabel(sec: EventSectionGroupRow): string {
  const g = clean(sec.section_group);
  if (g) return g;
  return fallbackLabel(sec);
}

function groupedColor(sec: EventSectionGroupRow): string | null {
  return sec.color ?? null;
}

export function buildSectionGroupMaps(sections: EventSectionGroupRow[]): SectionMaps {
  const byId = new Map<string, EventSectionGroupRow>();
  const byLabelKey = new Map<string, EventSectionGroupRow>();
  for (const sec of sections) {
    byId.set(sec.id, sec);
    const nameKey = keyOf(sec.name);
    if (nameKey && !byLabelKey.has(nameKey)) byLabelKey.set(nameKey, sec);
    const codeKey = keyOf(sec.section_code);
    if (codeKey && !byLabelKey.has(codeKey)) byLabelKey.set(codeKey, sec);
  }
  return { byId, byLabelKey };
}

/** Admitted drilldown: keep real section name + optional group (not merged into one label). */
function resolveAdmittedSectionFields(
  maps: SectionMaps,
  eventSectionId: string | null | undefined,
  sectionLabelFromRecord: string | null | undefined
): { section_name: string; section_group: string } {
  const id = eventSectionId ?? null;
  const label = sectionLabelFromRecord ?? null;
  const sec = id ? maps.byId.get(id) : undefined;
  const secFromLabel =
    !sec && label ? maps.byLabelKey.get(keyOf(label)) : undefined;
  const resolved = sec ?? secFromLabel;
  if (resolved) {
    return {
      section_name: fallbackLabel(resolved),
      section_group: clean(resolved.section_group),
    };
  }
  return {
    section_name: clean(label) || "Other",
    section_group: "",
  };
}

export function resolveSectionGroup(
  maps: SectionMaps,
  sectionId?: string | null,
  sectionName?: string | null
): { label: string; color: string | null; sortOrder: number } {
  const sec = sectionId ? maps.byId.get(sectionId) : undefined;
  if (sec) {
    return {
      label: groupedLabel(sec),
      color: groupedColor(sec),
      sortOrder: sec.sort_order ?? 9999,
    };
  }
  const fromLabel = maps.byLabelKey.get(keyOf(sectionName));
  if (fromLabel) {
    return {
      label: groupedLabel(fromLabel),
      color: groupedColor(fromLabel),
      sortOrder: fromLabel.sort_order ?? 9999,
    };
  }
  return {
    label: clean(sectionName) || "Other",
    color: null,
    sortOrder: 9999,
  };
}

export function applyGroupingToDashboardReport(
  report: Record<string, unknown>,
  maps: SectionMaps
): Record<string, unknown> {
  const next = { ...report };

  const sectionsSales = Array.isArray(report.sections_sales)
    ? (report.sections_sales as Array<Record<string, unknown>>)
    : [];
  if (sectionsSales.length > 0) {
    const grouped = new Map<
      string,
      {
        section_id: string;
        section_name: string;
        section_color: string | null;
        sort_order: number;
        capacity: number;
        sold_count: number;
      }
    >();
    for (const row of sectionsSales) {
      const { label, color, sortOrder } = resolveSectionGroup(
        maps,
        (row.section_id as string | undefined) ?? null,
        (row.section_name as string | undefined) ?? null
      );
      const existing = grouped.get(label) ?? {
        section_id: `group:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        section_name: label,
        section_color: color,
        sort_order: sortOrder,
        capacity: 0,
        sold_count: 0,
      };
      existing.capacity += Number(row.capacity ?? 0);
      existing.sold_count += Number(row.sold_count ?? 0);
      if (!existing.section_color && color) existing.section_color = color;
      existing.sort_order = Math.min(existing.sort_order, sortOrder);
      grouped.set(label, existing);
    }
    next.sections_sales = [...grouped.values()]
      .map((r) => ({
        ...r,
        sold_pct: r.capacity > 0 ? Number(((r.sold_count / r.capacity) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => (b.sold_pct as number) - (a.sold_pct as number));
  }

  const vssBreakdown = Array.isArray(report.vss_breakdown)
    ? (report.vss_breakdown as Array<Record<string, unknown>>)
    : [];
  if (vssBreakdown.length > 0) {
    const grouped = new Map<
      string,
      {
        section_id: string;
        section_name: string;
        section_color: string | null;
        sort_order: number;
        sold: number;
        distributed: number;
        complimentary: number;
        available: number;
      }
    >();
    for (const row of vssBreakdown) {
      const { label, color, sortOrder } = resolveSectionGroup(
        maps,
        (row.section_id as string | undefined) ?? null,
        (row.section_name as string | undefined) ?? null
      );
      const existing = grouped.get(label) ?? {
        section_id: `group:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        section_name: label,
        section_color: color,
        sort_order: sortOrder,
        sold: 0,
        distributed: 0,
        complimentary: 0,
        available: 0,
      };
      existing.sold += Number(row.sold ?? 0);
      existing.distributed += Number(row.distributed ?? 0);
      existing.complimentary += Number(row.complimentary ?? 0);
      existing.available += Number(row.available ?? 0);
      if (!existing.section_color && color) existing.section_color = color;
      existing.sort_order = Math.min(existing.sort_order, sortOrder);
      grouped.set(label, existing);
    }
    next.vss_breakdown = [...grouped.values()].sort((a, b) => {
      if ((a.sort_order ?? 9999) !== (b.sort_order ?? 9999)) {
        return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
      }
      return a.section_name.localeCompare(b.section_name);
    });
  }

  const sectionRevenue = Array.isArray(report.section_revenue)
    ? (report.section_revenue as Array<Record<string, unknown>>)
    : [];
  if (sectionRevenue.length > 0) {
    const grouped = new Map<
      string,
      {
        section_id: string;
        section_name: string;
        sort_order: number;
        amount_paid_cents: number;
        distributed_value_cents: number;
        complimentary_value_cents: number;
        projected_revenue_cents: number;
      }
    >();
    for (const row of sectionRevenue) {
      const { label, sortOrder } = resolveSectionGroup(
        maps,
        (row.section_id as string | undefined) ?? null,
        (row.section_name as string | undefined) ?? null
      );
      const existing = grouped.get(label) ?? {
        section_id: `group:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        section_name: label,
        sort_order: sortOrder,
        amount_paid_cents: 0,
        distributed_value_cents: 0,
        complimentary_value_cents: 0,
        projected_revenue_cents: 0,
      };
      existing.amount_paid_cents += Number(row.amount_paid_cents ?? 0);
      existing.distributed_value_cents += Number(row.distributed_value_cents ?? 0);
      existing.complimentary_value_cents += Number(row.complimentary_value_cents ?? 0);
      existing.projected_revenue_cents += Number(row.projected_revenue_cents ?? 0);
      existing.sort_order = Math.min(existing.sort_order, sortOrder);
      grouped.set(label, existing);
    }
    next.section_revenue = [...grouped.values()].sort((a, b) => {
      if ((a.sort_order ?? 9999) !== (b.sort_order ?? 9999)) {
        return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
      }
      return a.section_name.localeCompare(b.section_name);
    });
  }

  return next;
}

export function applyGroupingToDrilldownRows(
  rows: Array<Record<string, unknown>>,
  metric: string,
  maps: SectionMaps
): Array<Record<string, unknown>> {
  if (rows.length === 0) return rows;
  // Keep distributed/complimentary rows ungrouped so recipient-level drilldowns retain
  // recipient_name/email and per-assignment details.
  const bySectionMetrics = new Set(["capacity", "sold", "occupancy"]);
  if (metric === "revenue") return rows;

  if (metric === "admitted") {
    return rows.map((row) => {
      const { section_name, section_group } = resolveAdmittedSectionFields(
        maps,
        (row.event_section_id as string | undefined) ?? null,
        (row.section_name as string | undefined) ?? null
      );
      return { ...row, section_name, section_group };
    });
  }

  if (!bySectionMetrics.has(metric)) return rows;

  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const { label } = resolveSectionGroup(
      maps,
      (row.section_id as string | undefined) ?? (row.event_section_id as string | undefined) ?? null,
      (row.section_name as string | undefined) ?? null
    );
    const existing = grouped.get(label) ?? {
      section_name: label,
      capacity: 0,
      sold_count: 0,
      sold: 0,
      distributed: 0,
      complimentary: 0,
      available: 0,
      quantity: 0,
    };
    for (const k of ["capacity", "sold_count", "sold", "distributed", "complimentary", "available", "quantity"] as const) {
      existing[k] = Number(existing[k] ?? 0) + Number(row[k] ?? 0);
    }
    grouped.set(label, existing);
  }

  const merged = [...grouped.values()];
  if (metric === "sold") {
    return merged.map((row) => {
      const cap = Number(row.capacity ?? 0);
      const soldCount = Number(row.sold_count ?? 0);
      return {
        ...row,
        sold_pct: cap > 0 ? Number(((soldCount / cap) * 100).toFixed(1)) : 0,
      };
    });
  }
  if (metric === "occupancy") {
    return merged.map((row) => {
      const cap = Number(row.capacity ?? 0);
      const occ =
        Number(row.sold ?? 0) + Number(row.distributed ?? 0) + Number(row.complimentary ?? 0);
      return {
        ...row,
        occupancy_pct: cap > 0 ? Number(((occ / cap) * 100).toFixed(1)) : 0,
      };
    });
  }
  return merged;
}

