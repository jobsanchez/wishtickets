import { redirect } from "next/navigation";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import {
  SettingsTabsShell,
  type SettingsTabOption,
} from "./settings-tabs-shell";
import { EventsSettings } from "./events-settings";
import { SeatSettings } from "./seat-settings";
import { EmailTicketSettings } from "./email-ticket-settings";
import { PaymongoSettings } from "./paymongo-settings";
import { PromoCodesSettings } from "@/components/admin/promo-codes-settings";
import { TicketLayoutSettings } from "./ticket-layout-settings";
import { UsersSettings } from "./users-settings";
import { UserRolesSettings } from "./user-roles-settings";
import { TicketScanningSourceSettings } from "./ticket-scanning-source-settings";
import { StorageOrphanSettings } from "./storage-orphan-settings";
import { SessionSecuritySettings } from "./session-security-settings";
import { MetaPixelSettings } from "./meta-pixel-settings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: role } = await supabase.rpc("get_my_role");

  let capsList: string[] = [];
  try {
    const { data: caps } = await supabase
      .from("user_capabilities")
      .select("capability")
      .eq("user_id", user.id);
    capsList = ((caps ?? []) as { capability: string }[]).map((c) => c.capability);
  } catch {
    capsList = [];
  }

  const isSuperAdmin = role === "super_admin";
  const hasManageSettings = isSuperAdmin;
  const hasManageEvents =
    isSuperAdmin || capsList.includes("manage_events");
  const hasManageSeats =
    isSuperAdmin || capsList.includes("manage_seats");

  if (!hasManageSettings) {
    redirect("/dashboard");
  }

  const tabOptions: SettingsTabOption[] = [];
  if (hasManageEvents) {
    tabOptions.push({ value: "events", label: "Events Settings" });
  }
  if (hasManageSeats) {
    tabOptions.push({ value: "seat", label: "Seat Settings" });
  }
  tabOptions.push({ value: "email", label: "Email & Tickets" });
  tabOptions.push({
    value: "ticket-scanning-source",
    label: "Ticket Scanning Source",
  });
  if (hasManageEvents) {
    tabOptions.push({ value: "ticket-layout", label: "Ticket layout" });
  }
  tabOptions.push({ value: "promos", label: "Promo Codes" });
  if (isSuperAdmin) {
    tabOptions.push({ value: "paymongo", label: "Paymongo" });
    tabOptions.push({ value: "meta-pixel", label: "Meta Pixel" });
  }
  tabOptions.push({ value: "user-roles", label: "User Roles" });
  tabOptions.push({ value: "users", label: "Users" });
  if (isSuperAdmin) {
    tabOptions.push({ value: "session-security", label: "Session Security" });
  }
  tabOptions.push({ value: "storage-cleanup", label: "Storage cleanup" });

  const prefer =
    hasManageEvents ? "events" : hasManageSeats ? "seat" : "email";
  const defaultValue = tabOptions.some((t) => t.value === prefer)
    ? prefer
    : tabOptions[0]?.value ?? "email";

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
      <h1 className="text-2xl font-bold text-foreground mb-6">Global Settings</h1>
      <SettingsTabsShell tabOptions={tabOptions} defaultValue={defaultValue}>
        {hasManageEvents && (
          <TabsContent value="events">
            <EventsSettings />
          </TabsContent>
        )}
        {hasManageSeats && (
          <TabsContent value="seat">
            <SeatSettings />
          </TabsContent>
        )}
        <TabsContent value="email">
          <EmailTicketSettings />
        </TabsContent>
        <TabsContent value="ticket-scanning-source">
          <TicketScanningSourceSettings />
        </TabsContent>
        {hasManageEvents && (
          <TabsContent value="ticket-layout">
            <TicketLayoutSettings />
          </TabsContent>
        )}
        <TabsContent value="promos">
          <PromoCodesSettings />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="paymongo">
            <PaymongoSettings />
          </TabsContent>
        )}
        {isSuperAdmin && (
          <TabsContent value="meta-pixel">
            <MetaPixelSettings />
          </TabsContent>
        )}
        <TabsContent value="user-roles">
          <UserRolesSettings />
        </TabsContent>
        <TabsContent value="users">
          <UsersSettings />
        </TabsContent>
        {isSuperAdmin && (
          <TabsContent value="session-security">
            <SessionSecuritySettings />
          </TabsContent>
        )}
        <TabsContent value="storage-cleanup">
          <StorageOrphanSettings />
        </TabsContent>
      </SettingsTabsShell>
    </div>
  );
}
