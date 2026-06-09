import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessTicketResendAdminTools } from "@/lib/auth";
import { TicketResending } from "@/components/admin/ticket-resending";

export default async function TicketResendingPage() {
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

  return <TicketResending />;
}

