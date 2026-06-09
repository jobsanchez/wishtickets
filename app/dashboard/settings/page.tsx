import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UserSettingsForm } from "./user-settings-form";

export default async function DashboardSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="container mx-auto px-4 py-12">
      <Link
        href="/dashboard"
        className="text-sm text-[var(--wish-orange)] hover:underline mb-4 inline-block"
      >
        ← Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold text-foreground mb-2">Personal Settings</h1>
      <p className="text-foreground-muted mb-6">
        Edit your name, change your password, and manage your account.
      </p>
      <UserSettingsForm />
    </div>
  );
}
