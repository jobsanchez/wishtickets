"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { toast } from "@/lib/toast";

interface DangerZoneClearDatabaseProps {
  superAdminId: string;
}

export function DangerZoneClearDatabase({ superAdminId }: DangerZoneClearDatabaseProps) {
  void superAdminId;
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleClear() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/clear-database", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to clear database");
      }
      toast.success("Database cleared successfully.");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear database");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message="Clearing database"
        subtitle="Danger zone"
        detail="Removing application data as requested. This may take a while — keep this tab open."
      />
      <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-6 dark:border-red-500/50 dark:bg-red-950/20">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger Zone</h2>
        <p className="mt-2 text-sm text-foreground">
          These actions are irreversible. Clear database removes all users (except you), events,
          venues, bookings, tickets, images, and every other record.
        </p>
        <Button
          type="button"
          variant="destructive"
          className="mt-4"
          onClick={() => setDialogOpen(true)}
          disabled={loading}
        >
          Clear database
        </Button>
      </div>
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Clear entire database?"
        description="This will permanently delete all users (except you), events, venues, bookings, tickets, payments, images, and every other record. Only your profile will remain. This cannot be undone."
        confirmLabel="Clear database"
        variant="destructive"
        onConfirm={handleClear}
      />
    </>
  );
}
