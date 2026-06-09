"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useTheme } from "@/components/providers/theme-provider";
import { hardAuthReset } from "@/lib/supabase/auth-hard-reset";

type HeaderUser = { id?: string; email?: string; name?: string };

const HeaderDesktopAccount = dynamic(
  () =>
    import("@/components/header-desktop-account").then((m) => ({
      default: m.HeaderDesktopAccount,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="hidden md:flex items-center gap-3">
        <Button variant="secondary" asChild>
          <Link href="/login" prefetch>
            Sign In
          </Link>
        </Button>
        <Button asChild>
          <Link href="/signup" prefetch>
            Sign up for free
          </Link>
        </Button>
      </div>
    ),
  }
);

const HeaderMobileMenu = dynamic(
  () =>
    import("@/components/header-mobile-menu").then((m) => ({
      default: m.HeaderMobileMenu,
    })),
  {
    ssr: false,
    loading: () => (
      <Button variant="secondary" size="icon" className="md:hidden" disabled aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>
    ),
  }
);

interface HeaderProps {
  initialRole?: string | null;
}

export function Header({ initialRole = null }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [role, setRole] = useState<string | null>(initialRole);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const isAdminOrSuperAdmin = role === "admin" || role === "super_admin";
  const canSeeAdmissionsLogin = true;

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      if (cancelled) return;
      const supabase = createClient();
      supabaseRef.current = supabase;
      async function fetchRole() {
        const { data } = await supabase.rpc("get_my_role");
        return (data as string | null) ?? null;
      }

      async function fetchProfileName(userId: string) {
        const { data } = await supabase
          .from("profiles")
          .select("username, full_name")
          .eq("id", userId)
          .single();
        const username =
          typeof data?.username === "string" ? data.username.trim() : "";
        const fullName =
          typeof data?.full_name === "string" ? data.full_name.trim() : "";
        return username || fullName || "";
      }

      function mapAuthUser(u: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null) {
        if (!u) return null;
        const metadata = u.user_metadata ?? {};
        const metadataName =
          (typeof metadata.username === "string" && metadata.username.trim()) ||
          (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
          (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
          (typeof metadata.name === "string" && metadata.name.trim()) ||
          (typeof metadata.first_name === "string" && metadata.first_name.trim()) ||
          "";
        const emailPrefix = u.email?.split("@")[0]?.trim() || "";
        const name = metadataName || emailPrefix || "Name";
        return { id: u.id, email: u.email ?? undefined, name };
      }

      async function mapAuthUserWithProfileName(
        u: { id?: string; email?: string | null; user_metadata?: Record<string, unknown> } | null
      ) {
        const mapped = mapAuthUser(u);
        if (!mapped?.id) return mapped;
        const profileName = await fetchProfileName(mapped.id);
        return { ...mapped, name: profileName || mapped.name };
      }

      supabase.auth.getUser().then(async ({ data: { user: u }, error }) => {
        if (error?.message?.includes("Invalid Refresh Token")) {
          await supabase.auth.signOut({ scope: "local" });
        }
        setUser(await mapAuthUserWithProfileName(u));
        if (u?.id) {
          fetchRole().then((r) => setRole(r));
        } else {
          setRole(null);
        }
      });
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user ?? null;
        void (async () => {
          setUser(await mapAuthUserWithProfileName(u));
          if (u?.id) {
            fetchRole().then((r) => setRole(r));
          } else {
            setRole(null);
          }
        })();
      });
      subscription = sub;
    })();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      supabaseRef.current = null;
    };
  }, []);

  async function handleSignOut() {
    const { createClient } = await import("@/lib/supabase/client");
    const client = supabaseRef.current ?? createClient();
    await hardAuthReset(client);
    setUser(null);
    setRole(null);
    window.location.replace("/");
  }

  return (
    <header className="sticky top-0 z-40 w-full glass border-b border-[var(--glass-border)]">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground shrink-0 min-w-0">
          <Image
            src="/logo.webp"
            alt=""
            width={48}
            height={48}
            priority
            sizes="24px"
            className="h-6 w-6 shrink-0 object-contain"
            aria-hidden
          />
          <span className="truncate">Wish Tickets Portal</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-foreground-muted">
          <Link href="/" className="hover:text-foreground transition-colors">
            Events
          </Link>
          <Link href="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <Link href="/contact" className="hover:text-foreground transition-colors">
            Contact
          </Link>
          {canSeeAdmissionsLogin && (
            <Link href="/admissions/login" className="hover:text-foreground transition-colors">
              Admissions Staff Login
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="shrink-0"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <HeaderDesktopAccount
            user={user}
            isAdminOrSuperAdmin={isAdminOrSuperAdmin}
            onSignOut={handleSignOut}
          />
          <HeaderMobileMenu
            user={user}
            isAdminOrSuperAdmin={isAdminOrSuperAdmin}
            canSeeAdmissionsLogin={canSeeAdmissionsLogin}
            onSignOut={handleSignOut}
          />
        </div>
      </div>
    </header>
  );
}
