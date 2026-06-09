"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { AlertDialog } from "@/components/ui/alert-dialog";

export function RetryTicketProcessingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogText, setDialogText] = useState("");

  const handleRetry = async () => {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/repair`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        email_sent?: boolean;
        remaining_missing_images?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setDialogText(
          data.error ??
            "Ticket processing retry failed. Please try again in a moment."
        );
        setDialogOpen(true);
        return;
      }

      setDialogText(
        `Retry complete. Email sent: ${data.email_sent ? "yes" : "no"}. Remaining missing ticket images: ${
          data.remaining_missing_images ?? 0
        }.`
      );
      setDialogOpen(true);
      router.refresh();
    } catch {
      setDialogText(
        "Ticket processing retry failed. Please try again in a moment."
      );
      setDialogOpen(true);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <FloatingProgressBar
        active={running}
        message="Retrying ticket processing"
        subtitle="Your booking"
        detail="Re-running ticket image generation and email delivery on the server."
      />
      <Button type="button" variant="outline" onClick={handleRetry} disabled={running}>
        Retry ticket processing
      </Button>
      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Ticket processing status"
        description={dialogText}
      />
    </>
  );
}

