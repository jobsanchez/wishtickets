import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { TicketLayoutSettings } from "../settings/ticket-layout-settings";

export default async function TicketLayoutPage() {
  const canManage = await requireSuperAdminOrCapability("manage_ticket_templates");
  if (!canManage) redirect("/admin");

  return (
    <div>
      <div className="mb-6">
        <NavButtonWithProgress
          href="/admin"
          variant="secondary"
          size="sm"
          className="bg-amber-400 text-black hover:bg-amber-300 border-transparent"
          loadingMessage="Loading dashboard…"
        >
          ← Back to Dashboard
        </NavButtonWithProgress>
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Ticket layout</h1>
      <TicketLayoutSettings />
    </div>
  );
}

