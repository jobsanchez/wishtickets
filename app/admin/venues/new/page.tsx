import { redirect } from "next/navigation";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { VenueForm } from "@/components/admin/venue-form";

export default async function NewVenuePage() {
  const canManage = await requireSuperAdminOrCapability("manage_venues");
  if (!canManage) redirect("/admin");

  return <VenueForm />;
}
