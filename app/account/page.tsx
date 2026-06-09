import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountPageClient } from "./account-page-client";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: bookingsRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, marketing_email_opt_in, username")
      .eq("id", user.id)
      .single(),
    supabase
      .from("bookings")
      .select("id, status, created_at, event:events(id, title, slug, event_start, status), tickets(id)")
      .eq("user_id", user.id),
  ]);

  return (
    <AccountPageClient
      userId={user.id}
      email={user.email ?? ""}
      initialFullName={profile?.full_name ?? ""}
      initialUsername={profile?.username ?? ""}
      initialMarketingEmailOptIn={profile?.marketing_email_opt_in ?? true}
      bookings={bookingsRaw ?? []}
    />
  );
}
