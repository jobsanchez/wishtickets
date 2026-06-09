"use client";

import { createContext, useContext, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PermissionDialogContextValue {
  showPermissionDialog: () => void;
}

const PermissionDialogContext = createContext<PermissionDialogContextValue | null>(null);

export function usePermissionDialog() {
  const ctx = useContext(PermissionDialogContext);
  return ctx;
}

export function PermissionDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const showPermissionDialog = useCallback(() => setOpen(true), []);

  return (
    <PermissionDialogContext.Provider value={{ showPermissionDialog }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Permission required</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground-muted">
            You don&apos;t have permission to perform this action. Contact an administrator if you need access.
          </p>
        </DialogContent>
      </Dialog>
    </PermissionDialogContext.Provider>
  );
}
