import { RouteLoading } from "@/components/ui/route-loading";

export default function DashboardLoading() {
  return (
    <RouteLoading
      message="Loading dashboard…"
      subtitle="Pulling up your bookings and account tools."
    />
  );
}
