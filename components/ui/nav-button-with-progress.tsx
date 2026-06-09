"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

interface NavButtonWithProgressProps {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /** Message shown during navigation (default: "Loading…") */
  loadingMessage?: string;
  /** Overrides navigation preset subtitle while the route loads */
  loadingSubtitle?: string;
  /** Overrides navigation preset detail while the route loads */
  loadingDetail?: string;
  /** Optional async work to run before navigation starts */
  onBeforeNavigate?: () => Promise<void> | void;
}

export function NavButtonWithProgress({
  href,
  children,
  variant = "default",
  size,
  className,
  loadingMessage = "Loading…",
  loadingSubtitle,
  loadingDetail,
  onBeforeNavigate,
}: NavButtonWithProgressProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPreparing, setIsPreparing] = useState(false);
  const navPreset = FLOATING_PROGRESS_PRESETS.navigation;

  const handleClick = async () => {
    if (isPending || isPreparing) return;
    if (onBeforeNavigate) {
      setIsPreparing(true);
      try {
        await onBeforeNavigate();
      } catch {
        // Best effort: still continue to navigation.
      } finally {
        setIsPreparing(false);
      }
    }
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      <FloatingProgressBar
        active={isPending || isPreparing}
        {...navPreset}
        message={isPreparing ? "Preparing seats…" : loadingMessage}
        subtitle={loadingSubtitle ?? navPreset.subtitle}
        detail={loadingDetail ?? navPreset.detail}
      />
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={handleClick}
        disabled={isPending || isPreparing}
      >
        {children}
      </Button>
    </>
  );
}
