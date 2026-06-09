"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Rendered directly under the title (e.g. prominent seat assignment). */
  belowTitle?: ReactNode;
  /** Dynamic block rendered above description body. */
  extraContent?: ReactNode;
  description: ReactNode;
  buttonLabel?: string;
  titleClassName?: string;
  buttonClassName?: string;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  belowTitle,
  extraContent,
  description,
  buttonLabel = "OK",
  titleClassName,
  buttonClassName,
}: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-md" highZIndex>
        <DialogHeader className="flex flex-col items-center text-center sm:text-center">
          <DialogTitle className={titleClassName ?? "text-xl text-foreground"}>{title}</DialogTitle>
          {belowTitle ? (
            <div className="mt-3 w-full max-w-sm text-left sm:text-center">{belowTitle}</div>
          ) : null}
          <DialogDescription asChild>
            <div className="mt-2 w-full max-w-sm text-left text-base">
              {extraContent ? <div className="mb-2">{extraContent}</div> : null}
              {typeof description === "string" ? (
                <p className="text-foreground-muted">{description}</p>
              ) : (
                description
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 flex w-full flex-col items-stretch justify-center gap-3">
          <Button
            onClick={() => onOpenChange(false)}
            className={
              buttonClassName ??
              "w-full bg-[var(--wish-orange)] hover:bg-[var(--wish-orange-hover)]"
            }
          >
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
