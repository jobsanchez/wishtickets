"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { Mail } from "lucide-react";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";

export function SendTicketsButton({ bookingId }: { bookingId: string }) {
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Failed to send ticket email.");

  const handleClick = async () => {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/send-email`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const message =
          body?.error && body.error.trim().length > 0
            ? body.error
            : "Failed to send ticket email.";
        setErrorMessage(message);
        setErrorDialogOpen(true);
        toast.error(message);
        return;
      }
      toast.success("Tickets email sent.");
      setDialogOpen(true);
    } catch (err) {
      console.error("Error sending tickets email", err);
      const message = "Could not contact the server. Please try again.";
      setErrorMessage(message);
      setErrorDialogOpen(true);
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <FloatingProgressBar
        active={sending}
        message="Sending tickets to your email"
        subtitle="Your booking"
        detail="Queuing ticket images and delivery to the address on your account."
      />
      <Button
        type="button"
        variant="outline"
        className="border-0 bg-green-600 text-white hover:bg-green-500"
        onClick={handleClick}
        disabled={sending}
      >
        <Mail className="h-4 w-4" />
        <span>Send tickets to email</span>
      </Button>
      <AlertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Tickets sent to your email"
        description="We’ve sent your tickets to the email address on your account. If you don’t see them, please check your spam or promotions folder."
      />
      <AlertDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        title="Could not send ticket email"
        description={errorMessage}
      />
    </>
  );
}

