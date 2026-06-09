"use client";

import { FloatingProgressBar } from "@/components/ui/floating-progress";

type BookProgressOverlayProps = {
  active: boolean;
  message: string;
  subtitle?: string;
  detail?: string;
};

export function BookProgressOverlay({
  active,
  message,
  subtitle,
  detail,
}: BookProgressOverlayProps) {
  return (
    <FloatingProgressBar
      active={active}
      message={message}
      subtitle={subtitle}
      detail={detail}
    />
  );
}
