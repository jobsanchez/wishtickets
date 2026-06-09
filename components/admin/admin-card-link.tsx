"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { usePermissionDialog } from "@/components/providers/permission-dialog-provider";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

interface AdminCardLinkProps {
  href: string;
  allowed: boolean;
  children: React.ReactNode;
  className?: string;
}

export function AdminCardLink({
  href,
  allowed,
  children,
  className,
}: AdminCardLinkProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const ctx = usePermissionDialog();

  const baseClasses = className ?? "";

  if (allowed) {
    return (
      <>
        <FloatingProgressBar
          active={isPending}
          {...FLOATING_PROGRESS_PRESETS.navigation}
          message="Loading…"
        />
        <button
          type="button"
          className={baseClasses}
          onClick={() => startTransition(() => router.push(href))}
          disabled={isPending}
        >
          {children}
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => ctx?.showPermissionDialog()}
      className={baseClasses}
    >
      {children}
    </button>
  );
}

