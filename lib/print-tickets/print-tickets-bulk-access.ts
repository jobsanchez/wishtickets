import { forbiddenUnlessAnyEventSection } from "@/lib/require-event-section";
import { getProfileRole, getCurrentUserId, hasCapability } from "@/lib/auth";
import type { NextResponse } from "next/server";

async function globalCanManagePrintTickets() {
  const role = await getProfileRole();
  if (role === "super_admin" || role === "admin" || role === "admissions_staff")
    return true;
  const userId = await getCurrentUserId();
  if (!userId) return false;
  return (
    hasCapability(userId, "manage_seats") ||
    hasCapability(userId, "manage_assignments")
  );
}

/**
 * Matches section ZIP / bulk print routes: global staff OR per-event assign / printTickets.
 */
export async function forbiddenUnlessPrintTicketsBulkScope(
  eventId: string
): Promise<NextResponse | null> {
  if (await globalCanManagePrintTickets()) return null;
  return forbiddenUnlessAnyEventSection(eventId, ["assign", "printTickets"]);
}
