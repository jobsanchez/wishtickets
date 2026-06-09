"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/providers/theme-provider";

export function ThemeAwareToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-right" />;
}
