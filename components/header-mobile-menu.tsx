"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  FileText,
  Info,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Shield,
  Ticket,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FLOATING_PROGRESS_PRESETS,
  FloatingProgressBar,
} from "@/components/ui/floating-progress";

function MobileHeaderNavRoute({
  href,
  navRow,
  icon,
  label,
  loadingMessage,
  loadingSubtitle,
  loadingDetail,
}: {
  href: string;
  navRow: string;
  icon: ReactNode;
  label: string;
  loadingMessage: string;
  loadingSubtitle: string;
  loadingDetail: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navPreset = FLOATING_PROGRESS_PRESETS.navigation;

  return (
    <>
      <FloatingProgressBar
        active={isPending}
        {...navPreset}
        message={loadingMessage}
        subtitle={loadingSubtitle}
        detail={loadingDetail}
      />
      <DialogClose asChild>
        <button
          type="button"
          className={navRow}
          onClick={() => {
            startTransition(() => {
              router.push(href);
            });
          }}
          disabled={isPending}
        >
          {icon}
          {label}
        </button>
      </DialogClose>
    </>
  );
}

export function HeaderMobileMenu({
  user,
  isAdminOrSuperAdmin,
  canSeeAdmissionsLogin,
  onSignOut,
}: {
  user: { id?: string; email?: string; name?: string } | null;
  isAdminOrSuperAdmin: boolean;
  canSeeAdmissionsLogin: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const greetingName = user?.name?.trim() || user?.email?.split("@")[0]?.trim() || "Account";

  async function handleSignOutConfirm() {
    await onSignOut();
  }

  useEffect(() => {
    if (user) return;
    router.prefetch("/login");
    router.prefetch("/signup");
  }, [user, router]);

  const navRow =
    "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-3 text-foreground/95 transition-[background-color,color] hover:bg-foreground/10 hover:text-foreground active:bg-foreground/15";
  const signOutRow =
    "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-3 text-left text-red-600 transition-[background-color,color] hover:bg-red-500/10 hover:text-red-700 active:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/15 dark:hover:text-red-300";

  const mobileNavLinks = (
    <>
      <DialogClose asChild>
        <Link href="/about" className={navRow}>
          <Info className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          About
        </Link>
      </DialogClose>
      {canSeeAdmissionsLogin && (
        <DialogClose asChild>
          <Link href="/admissions/login" className={navRow}>
            <KeyRound className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Admissions Staff Login
          </Link>
        </DialogClose>
      )}
      <DialogClose asChild>
        <Link href="/contact" className={navRow}>
          <Mail className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          Contact
        </Link>
      </DialogClose>
      <DialogClose asChild>
        <Link href="/" className={navRow}>
          <Ticket className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          Events
        </Link>
      </DialogClose>
      <DialogClose asChild>
        <Link href="/privacy-policy" className={navRow}>
          <FileText className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
          Privacy Policy
        </Link>
      </DialogClose>
    </>
  );

  return (
    <>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogTrigger asChild>
        {user ? (
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden max-w-[170px] truncate"
            aria-label="Open account menu"
          >
            <span className="truncate">{user.name?.trim() || user.email?.trim() || "Account"}</span>
          </Button>
        ) : (
          <Button variant="secondary" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        variant="sheetRight"
        hideClose
        aria-describedby={undefined}
        className="h-full max-h-[100dvh] w-[min(300px,88vw)] max-w-none rounded-none rounded-l-2xl border-0 p-0 shadow-2xl data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
      >
        <div
          className="flex h-full min-h-0 flex-col pl-0 pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
        >
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--glass-border)] bg-background pl-4 pr-2 py-3"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
          >
            <div className="min-w-0 pl-1 text-sm font-semibold text-foreground">
              {user ? <span className="block truncate">{`Hi ${greetingName}`}</span> : null}
            </div>
            <DialogTitle className="sr-only">Menu</DialogTitle>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                className="-mr-1 shrink-0 text-foreground hover:bg-foreground/10"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
          <nav
            className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overscroll-y-contain pl-4 pr-0 py-2"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
          >
          {mobileNavLinks}
          {user ? (
            <>
              <div className="my-2 h-px bg-[var(--glass-border)]" />
              {isAdminOrSuperAdmin && (
                <MobileHeaderNavRoute
                  href="/admin"
                  navRow={navRow}
                  label="Admin"
                  loadingMessage="Opening admin dashboard"
                  loadingSubtitle="Admin"
                  loadingDetail="Taking you to the admin dashboard. If this stays open, wait a moment or check your connection."
                  icon={<Shield className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
                />
              )}
              <MobileHeaderNavRoute
                href="/account?tab=orders"
                navRow={navRow}
                label="Order History"
                loadingMessage="Opening order history"
                loadingSubtitle="Account"
                loadingDetail="Loading your account order history. If this stays open, wait a moment or check your connection."
                icon={<LayoutDashboard className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
              />
              <MobileHeaderNavRoute
                href="/account?tab=personal"
                navRow={navRow}
                label="My Account"
                loadingMessage="Opening account settings"
                loadingSubtitle="Account"
                loadingDetail="Loading your account details. If this stays open, wait a moment or check your connection."
                icon={<User className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
              />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setSignOutDialogOpen(true);
                }}
                className={signOutRow}
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Sign Out
              </button>
            </>
          ) : (
            <>
              <div className="my-2 h-px bg-[var(--glass-border)]" />
              <MobileHeaderNavRoute
                href="/login"
                navRow={navRow}
                label="Sign In"
                loadingMessage="Opening sign in"
                loadingSubtitle="Sign in page"
                loadingDetail="Taking you to the sign in page. If this stays open, wait a moment or check your connection."
                icon={<LogIn className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
              />
              <MobileHeaderNavRoute
                href="/signup"
                navRow={navRow}
                label="Sign up for free"
                loadingMessage="Opening sign up"
                loadingSubtitle="Sign up for free"
                loadingDetail="Taking you to sign up. If this stays open, wait a moment or check your connection."
                icon={<UserPlus className="h-4 w-4 shrink-0 opacity-90" aria-hidden />}
              />
            </>
          )}
        </nav>
        </div>
      </DialogContent>
    </Dialog>
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
    </>
  );
}
