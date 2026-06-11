"use client";

import Link from "next/link";
import { ReturnAndRefundPolicySections } from "@/components/legal/return-and-refund-policy-sections";

export function ReturnAndRefundPolicyContent() {
  return (
    <div className="container mx-auto px-4 py-12 md:py-16 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <p className="text-sm text-foreground-muted mb-2">
            Wish Tickets Portal
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Return and Refund Policy
          </h1>
          <p className="text-foreground-muted mt-3 leading-relaxed">
            How ticket purchases, refunds, exchanges, and government discounts
            work on the Wish Tickets Portal.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Link
              href="/"
              className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              Browse events
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-1.5 text-foreground-muted hover:text-foreground transition-colors"
            >
              Contact support
            </Link>
          </div>
        </div>

        <ReturnAndRefundPolicySections className="space-y-10" />
      </div>
    </div>
  );
}
