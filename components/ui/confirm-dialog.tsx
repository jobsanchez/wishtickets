"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { FloatingProgressBar } from "@/components/ui/floating-progress";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  cancelVariant?: ButtonProps["variant"];
  titleClassName?: string;
  loadingMessage?: string;
  /** @deprecated Use `loadingDetail` for body copy (maps to `FloatingProgressBar` `detail`). */
  loadingSubMessage?: string;
  loadingSubtitle?: string;
  loadingDetail?: string;
  /** Return `false` to keep the dialog open (e.g. validation or API error); any other return closes it. */
  onConfirm: () => boolean | void | Promise<boolean | void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  cancelVariant = "secondary",
  titleClassName,
  loadingMessage,
  loadingSubMessage,
  loadingSubtitle,
  loadingDetail,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const out = await onConfirm();
      if (out !== false) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FloatingProgressBar
        active={loading}
        message={loadingMessage ?? "Working…"}
        subtitle={loadingSubtitle}
        detail={loadingDetail ?? loadingSubMessage}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {variant === "destructive" && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
            )}
            <div>
              <DialogTitle className={cn("text-foreground", titleClassName)}>
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 mt-6">
          <Button
            type="button"
            variant={cancelVariant}
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
