"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CartStayLongerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStayLonger: () => Promise<void>;
  /**
   * Called when the user explicitly declines to stay longer (presses "No thanks" or the
   * dialog backdrop). When provided, the parent owns clearing the cart immediately so the
   * declined state matches the natural expiry flow (no waiting for the countdown to zero).
   * When omitted, the dialog falls back to a plain close.
   */
  onDecline?: () => void;
  isExtending?: boolean;
}

export function CartStayLongerDialog({
  open,
  onOpenChange,
  onStayLonger,
  onDecline,
  isExtending = false,
}: CartStayLongerDialogProps) {
  const handleDecline = () => {
    if (onDecline) {
      onDecline();
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Don't allow closing while the extension request is in flight.
        if (isExtending) return;
        if (!nextOpen) {
          handleDecline();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent hideClose className="max-w-md">
        <DialogHeader className="flex flex-col items-center text-center sm:text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wish-orange-muted)] mb-4">
            <AlertCircle className="h-7 w-7 text-[var(--wish-orange)]" />
          </div>
          <DialogTitle className="text-xl text-foreground">Your cart is about to expire</DialogTitle>
          <DialogDescription className="mt-2 text-base">
            Would you like to stay longer? If you choose &ldquo;No thanks,&rdquo; your cart and
            reserved seats will be released right away.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6">
          <Button
            onClick={handleDecline}
            className="w-full sm:w-auto"
            disabled={isExtending}
            variant="secondary"
          >
            No thanks
          </Button>
          <Button
            onClick={async () => {
              await onStayLonger();
            }}
            className="w-full bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)] sm:w-auto"
            disabled={isExtending}
          >
            {isExtending ? "Extending…" : "Stay longer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

