"use client";

import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

export default function AdminLoading() {
  return (
    <FloatingProgressBar
      active
      {...FLOATING_PROGRESS_PRESETS.navigation}
      message="Loading admin…"
      subtitle="Admin area"
      detail="Fetching the next screen from the server. Your menus and data will appear when ready."
    />
  );
}
