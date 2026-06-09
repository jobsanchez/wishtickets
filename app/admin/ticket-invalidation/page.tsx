import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessTicketResendAdminTools } from "@/lib/auth";
import { TicketInvalidation } from "@/components/admin/ticket-invalidation";

export default async function TicketInvalidationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await canAccessTicketResendAdminTools())) {
    redirect("/admin");
  }

  return <TicketInvalidation />;
}

