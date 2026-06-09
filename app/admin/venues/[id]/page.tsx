import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { VenueForm } from "@/components/admin/venue-form";

export default async function EditVenuePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const canManage = await requireSuperAdminOrCapability("manage_venues");
  if (!canManage) redirect("/admin");

  const supabase = await createClient();
  const { data: venue } = await supabase
    .from("venues")
    .select("id, name, province_id, city_id, standard_capacity, google_maps_url")
    .eq("id", id)
    .single();

  if (!venue) notFound();

  return <VenueForm venueId={id} initialVenue={venue} />;
}
