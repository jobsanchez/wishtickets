"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavProps {
  canEvents: boolean;
  canVenues: boolean;
  canReports: boolean;
  canAssignments: boolean;
  canPromos: boolean;
  canSettings: boolean;
}

function navLinkClass(href: string, pathname: string) {
  const isActive =
    href === "/admin"
      ? pathname === "/admin" || pathname === "/admin/"
      : pathname.startsWith(href);
  return isActive
    ? "text-[var(--wish-orange)] hover:underline"
    : "text-foreground-muted hover:text-foreground";
}

export function AdminNav({
  canEvents,
  canVenues,
  canReports,
  canAssignments,
  canPromos,
  canSettings,
}: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 mb-8 text-sm flex-wrap">
      <Link
        href="/admin"
        className={navLinkClass("/admin", pathname ?? "")}
      >
        Dashboard
      </Link>
      {canEvents && (
        <>
          <Link
            href="/admin/events"
            className={navLinkClass("/admin/events", pathname ?? "")}
          >
            Events
          </Link>
          <Link
            href="/admin/ticket-layout"
            className={navLinkClass("/admin/ticket-layout", pathname ?? "")}
          >
            Ticket layout
          </Link>
        </>
      )}
      {canVenues && (
        <Link
          href="/admin/venues"
          className={navLinkClass("/admin/venues", pathname ?? "")}
        >
          Venues
        </Link>
      )}
      {canReports && (
        <Link
          href="/admin/reports"
          className={navLinkClass("/admin/reports", pathname ?? "")}
        >
          Reports
        </Link>
      )}
      {canAssignments && (
        <Link
          href="/admin/ticket-assignments"
          className={navLinkClass("/admin/ticket-assignments", pathname ?? "")}
        >
          Manual Distribution
        </Link>
      )}
      {canPromos && (
        <Link
          href="/admin/promo-codes"
          className={navLinkClass("/admin/promo-codes", pathname ?? "")}
        >
          Promo Codes
        </Link>
      )}
      {canSettings && (
        <Link
          href="/admin/settings"
          className={navLinkClass("/admin/settings", pathname ?? "")}
        >
          Global Settings
        </Link>
      )}
    </nav>
  );
}
