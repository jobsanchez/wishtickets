"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

function subscribeToDataTheme(onStoreChange: () => void) {
  const el = document.documentElement;
  const observer = new MutationObserver(onStoreChange);
  observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getDataThemeSnapshot(): "light" | "dark" {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "light" ? "light" : "dark";
}

/**
 * Hero backdrop: first paint is theme `bg-background` only; the WebP mounts after
 * a double `requestAnimationFrame` with `fetchPriority="low"`, then fades in on load.
 * @see next.config re `images.unoptimized` on Netlify.
 */
export function BackgroundImage({
  initialTheme = "dark",
}: {
  initialTheme?: "light" | "dark";
}) {
  const [mountImage, setMountImage] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const theme = useSyncExternalStore(
    subscribeToDataTheme,
    getDataThemeSnapshot,
    () => initialTheme
  );
  const isLight = theme === "light";

  useEffect(() => {
    if (isLight) {
      setMountImage(false);
      setImageLoaded(false);
      return;
    }
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setMountImage(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [isLight]);

  if (isLight) return null;

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      suppressHydrationWarning
    >
      <div
        className="absolute inset-0 bg-background"
        aria-hidden
        suppressHydrationWarning
      />
      {mountImage ? (
        <div
          className="absolute inset-0 opacity-90 transition-opacity duration-500 motion-reduce:transition-none data-[ready=false]:opacity-0"
          style={{ filter: "brightness(0.42)" }}
          data-ready={imageLoaded}
          aria-hidden
          suppressHydrationWarning
        >
          <picture className="absolute inset-0 block h-full w-full">
            <source media="(max-width: 640px)" srcSet="/concert-bg-sm.webp" />
            <img
              src="/concert-bg.webp"
              alt=""
              fetchPriority="low"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: "center 50%" }}
              onLoad={() => setImageLoaded(true)}
            />
          </picture>
        </div>
      ) : null}
      {mountImage ? (
        <div
          className="absolute inset-0 bg-background/85 transition-opacity duration-500 motion-reduce:transition-none data-[ready=false]:opacity-0"
          data-ready={imageLoaded}
          aria-hidden
          suppressHydrationWarning
        />
      ) : null}
    </div>
  );
}
