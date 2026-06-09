import { RouteLoading } from "@/components/ui/route-loading";

export default function EventLoading() {
  return (
    <RouteLoading
      variant="fullscreen"
      message="Loading event…"
      subtitle="Hang tight — we're opening seating and event details."
      fullscreenAriaLabel="Loading event"
    />
  );
}
