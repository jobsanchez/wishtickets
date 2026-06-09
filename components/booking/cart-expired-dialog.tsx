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

interface CartExpiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartExpiredDialog({
  open,
  onOpenChange,
}: CartExpiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md">
        <DialogHeader className="flex flex-col items-center text-center sm:text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wish-orange-muted)] mb-4">
            <AlertCircle className="h-7 w-7 text-[var(--wish-orange)]" />
          </div>
          <DialogTitle className="text-xl text-foreground">
            Oops… your cart has expired.
          </DialogTitle>
          <DialogDescription className="mt-2 text-base">
            Please complete your purchase within the time shown, or your tickets
            and items will be released for others to purchase.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)] sm:w-auto"
          >
            Back to Seats
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
