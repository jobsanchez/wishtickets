import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { requireSuperAdminOrCapability } from "@/lib/auth";
import { ProducerForm } from "@/components/admin/producer-form";

export default async function EditProducerPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const canManage = await requireSuperAdminOrCapability("manage_events");
  if (!canManage) redirect("/admin");

  const supabase = await createClient();
  const { data: producer } = await supabase
    .from("event_producers")
    .select("id, name, producer_representative, contact, email")
    .eq("id", id)
    .single();

  if (!producer) notFound();

  return <ProducerForm producerId={id} initialProducer={producer} />;
}
