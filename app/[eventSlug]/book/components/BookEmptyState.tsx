"use client";

type BookEmptyStateProps = {
  show: boolean;
  message: string;
};

export function BookEmptyState({ show, message }: BookEmptyStateProps) {
  if (!show) return null;
  return (
    <div className="glass-light rounded-xl border border-[var(--glass-border)] p-6 text-foreground-muted">
      {message}
    </div>
  );
}
