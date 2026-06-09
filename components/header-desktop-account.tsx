"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { History, LogOut, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavButtonWithProgress } from "@/components/ui/nav-button-with-progress";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function HeaderDesktopAccount({
  user,
  isAdminOrSuperAdmin,
  onSignOut,
}: {
  user: { id?: string; email?: string; name?: string } | null;
  isAdminOrSuperAdmin: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const displayName = user?.name?.trim() || "Name";
  const greetingName =
    displayName.length > 0
      ? displayName.charAt(0).toUpperCase() + displayName.slice(1)
      : "Name";

  useEffect(() => {
    if (user) return;
    router.prefetch("/login");
    router.prefetch("/signup");
  }, [user, router]);

  async function handleSignOutConfirm() {
    await onSignOut();
  }

  return (
    <div className="hidden md:flex items-center gap-3">
      {user ? (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          {menuOpen ? (
            <DropdownMenuPortal>
              <div
                aria-hidden
                className="fixed inset-x-0 bottom-0 top-16 z-40 bg-black/45 backdrop-blur-[6px] transition-opacity duration-200"
              />
            </DropdownMenuPortal>
          ) : null}
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              className="max-w-[220px] justify-start truncate"
              aria-label="Open account menu"
            >
              <span className="truncate">{greetingName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px] p-0">
            <div className="px-3 py-2 text-lg font-semibold">{`Hi ${greetingName}`}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href="/account?tab=personal"
                prefetch={false}
                className="flex cursor-pointer items-center gap-2 px-3 py-3"
              >
                <User className="h-4 w-4" />
                My Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/account?tab=orders"
                prefetch={false}
                className="flex cursor-pointer items-center gap-2 px-3 py-3"
              >
                <History className="h-4 w-4" />
                Order History
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isAdminOrSuperAdmin && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin"
                    prefetch={false}
                    className="flex cursor-pointer items-center gap-2 px-3 py-3"
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                setSignOutDialogOpen(true);
              }}
              className="flex cursor-pointer items-center gap-2 px-3 py-3 text-red-400"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
          <NavButtonWithProgress
            href="/login"
            variant="secondary"
            loadingMessage="Opening sign in"
            loadingSubtitle="Sign in page"
            loadingDetail="Taking you to the sign in page. If this stays open, wait a moment or check your connection."
          >
            Sign In
          </NavButtonWithProgress>
          <NavButtonWithProgress
            href="/signup"
            loadingMessage="Opening sign up"
            loadingSubtitle="Sign up for free"
            loadingDetail="Taking you to sign up. If this stays open, wait a moment or check your connection."
          >
            Sign up for free
          </NavButtonWithProgress>
        </>
      )}
      <ConfirmDialog
        open={signOutDialogOpen}
        onOpenChange={setSignOutDialogOpen}
        title="Sign out of your account?"
        description="You will be logged out on this device and returned to the home page."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        variant="destructive"
        loadingMessage="Signing you out…"
        loadingSubtitle="Account"
        loadingDetail="Clearing your current session securely."
        onConfirm={handleSignOutConfirm}
      />
    </div>
  );
}
