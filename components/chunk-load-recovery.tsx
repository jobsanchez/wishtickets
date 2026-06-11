"use client";

import { useEffect } from "react";

const CHUNK_ERROR =
  /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i;

function reloadKey() {
  return `wish-chunk-reload:${window.location.pathname}`;
}

/**
 * Recover from stale webpack chunks after dev recompiles or post-deploy SW/cache mismatch.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message ?? "";
      const fromSource =
        typeof event.filename === "string" && event.filename.includes("/_next/static/chunks/");
      if (!CHUNK_ERROR.test(message) && !fromSource) return;

      const key = reloadKey();
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    };

    window.addEventListener("error", onError);
    const key = reloadKey();
    const clearTimer = window.setTimeout(() => {
      sessionStorage.removeItem(key);
    }, 15_000);

    return () => {
      window.removeEventListener("error", onError);
      window.clearTimeout(clearTimer);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
  }, []);

  return null;
}
