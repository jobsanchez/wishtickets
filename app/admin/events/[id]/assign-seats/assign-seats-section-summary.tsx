export function SectionTicketSummaryLines({
  rows,
  total,
}: {
  rows: Array<{ section: string; count: number }>;
  total: number;
}) {
  if (rows.length === 0 && total === 0) {
    return <p className="text-xs text-foreground-muted mt-1">—</p>;
  }
  return (
    <div className="text-xs text-foreground-muted mt-1 space-y-0.5">
      {rows.map((r) => (
        <div key={r.section}>
          {r.section} - {r.count}
        </div>
      ))}
      <div className="text-foreground/90 border-t border-[var(--glass-border)]/60 pt-1 mt-1">
        Total - {total}
      </div>
    </div>
  );
}
