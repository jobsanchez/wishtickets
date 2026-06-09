"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "theme";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const stored = document.documentElement.getAttribute("data-theme") as
    | Theme
    | null;
  if (stored === "light" || stored === "dark") return stored;
  const fromStorage = localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (fromStorage === "light" || fromStorage === "dark") return fromStorage;
  return "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${STORAGE_KEY}=${theme};path=/;max-age=${maxAge};SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Must match SSR: layout renders `<html data-theme="light">` before client-only sources exist.
  // Reading `document` / localStorage in useState would diverge on hydrate (e.g. user prefers dark).
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setThemeState(getInitialTheme());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      const supabase = createClient();

      async function syncThemeFromAuth() {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error?.message?.includes("Invalid Refresh Token")) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("theme_preference")
          .eq("id", user.id)
          .single();
        if (cancelled) return;
        const pref = data?.theme_preference as Theme | null;
        if (pref === "light" || pref === "dark") {
          setThemeState(pref);
          applyTheme(pref);
        }
      }

      await syncThemeFromAuth();
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange(() => {
        void syncThemeFromAuth();
      });
      subscription = sub;
    })();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [mounted]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      supabase.auth.getUser().then(async ({ data: { user }, error }) => {
        if (error?.message?.includes("Invalid Refresh Token")) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
        if (user) {
          fetch("/api/profile/theme", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ theme: newTheme }),
          }).catch(() => {});
        }
      });
    })();
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback: avoid crashing if a component renders outside ThemeProvider.
    // In normal app rendering, ThemeProvider is mounted in app/layout.tsx.
    return {
      theme: "light" as Theme,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return ctx;
}
