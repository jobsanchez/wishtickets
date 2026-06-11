"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReturnAndRefundPolicySections } from "@/components/legal/return-and-refund-policy-sections";

type ReturnAndRefundPolicyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReturnAndRefundPolicyDialog({
  open,
  onOpenChange,
}: ReturnAndRefundPolicyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(85vh,720px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--glass-border)] shrink-0">
          <DialogTitle>Return and Refund Policy</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-4 flex-1 min-h-0">
          <ReturnAndRefundPolicySections headingLevel="h3" />
        </div>
        <DialogFooter className="px-6 py-4 border-t border-[var(--glass-border)] shrink-0">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
