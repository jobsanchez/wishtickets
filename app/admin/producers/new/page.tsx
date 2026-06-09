import { redirect } from "next/navigation";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { ProducerForm } from "@/components/admin/producer-form";

export default async function NewProducerPage() {
  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) redirect("/admin");

  return <ProducerForm />;
}
