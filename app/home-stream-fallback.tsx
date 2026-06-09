import { LoadingTitle, WishLoadingSpinner } from "@/components/ui/route-loading";

export function HomeStreamFallback() {
  return (
    <div
      className="w-full pb-8"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading events"
    >
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 px-4">
        <LoadingTitle message="Loading events" compact />
        <p className="text-sm text-foreground-muted text-center max-w-[32ch]">
          Fetching the latest events and availability.
        </p>
        <WishLoadingSpinner size="sm" />
      </div>
    </div>
  );
}
