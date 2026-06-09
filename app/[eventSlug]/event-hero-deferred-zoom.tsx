"use client";

import { useEffect, useState, type ReactElement } from "react";

/**
 * Loads react-photo-view on idle so the initial event page pays less parse/compile cost.
 * Zoom is enabled after the chunk loads (usually before first interaction).
 */
export function EventHeroDeferredZoom({ src, children }: { src: string; children: ReactElement }) {
  const [mod, setMod] = useState<typeof import("react-photo-view") | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void import("react-photo-view/dist/react-photo-view.css");
      void import("react-photo-view").then((m) => {
        if (!cancelled) setMod(m);
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(load, { timeout: 3000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = setTimeout(load, 1);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!mod) {
    return children;
  }

  const { PhotoProvider, PhotoView } = mod;
  return (
    <PhotoProvider>
      <PhotoView src={src}>{children}</PhotoView>
    </PhotoProvider>
  );
}
