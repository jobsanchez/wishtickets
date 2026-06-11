import Link from "next/link";
import { Facebook, Instagram, X } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer mt-12 border-t border-[var(--glass-border)] text-foreground">
      <div className="container mx-auto px-4 py-10 md:py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--wish-orange)] mb-3">
              Wish Tickets Portal
            </p>
            <p className="text-foreground-muted leading-relaxed max-w-xs">
              A concert-ready ticketing platform by Wish 107.5 for live events,
              shows, and special experiences.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted mb-3">
              About Us
            </h3>
            <ul className="space-y-1 text-foreground-muted">
              <li>
                <Link
                  href="/about"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Who We Are
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Our Mission &amp; Vision
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted mb-3">
              Customer Care
            </h3>
            <ul className="space-y-1 text-foreground-muted">
              <li>
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Feedback &amp; Inquiries
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-muted mb-3">
              Terms &amp; Conditions
            </h3>
            <ul className="space-y-1 text-foreground-muted">
              <li>
                <Link
                  href="/privacy-policy"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-use"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link
                  href="/return-and-refund-policy"
                  className="inline-flex min-h-11 items-center py-2 -my-1 hover:text-[var(--wish-orange)] transition-colors"
                >
                  Return and Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="site-footer-bar border-t border-[var(--glass-border)]">
        <div className="container mx-auto px-4 py-4 text-xs text-foreground-muted">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-3 sm:gap-4 max-w-4xl mx-auto md:mx-0 mb-4 md:mb-3">
            <a
              href="https://www.paymongo.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 rounded-md ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wish-orange)] focus-visible:ring-offset-2"
              aria-label="PayMongo — opens in a new tab"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG badge; avoids Image remotePatterns for public path */}
              <img
                src="/brands/paymongo-logo.svg"
                alt="PayMongo"
                width={140}
                height={24}
                decoding="async"
                className="h-6 w-auto opacity-90 hover:opacity-100 transition-opacity"
              />
            </a>
            <p className="text-center sm:text-left leading-relaxed">
              All transactions are securely handled via PayMongo, ensuring fast,
              reliable, and protected payments for every purchase.
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p>© {year} Wish 107.5. All rights reserved.</p>
            <div className="flex items-center gap-2 sm:gap-4">
              <a
                href="https://www.facebook.com/WishFM1075"
                aria-label="Wish 107.5 on Facebook"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground-muted hover:text-[var(--wish-orange)] transition-colors"
              >
                <Facebook className="h-4 w-4" />
              </a>
              <a
                href="https://x.com/wish1075"
                aria-label="Wish 107.5 on X"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground-muted hover:text-[var(--wish-orange)] transition-colors"
              >
                <span className="site-footer-social-chip inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)]">
                  <X className="h-3.5 w-3.5" />
                </span>
              </a>
              <a
                href="https://www.instagram.com/wish1075/"
                aria-label="Wish 107.5 on Instagram"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-foreground-muted hover:text-[var(--wish-orange)] transition-colors"
              >
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

