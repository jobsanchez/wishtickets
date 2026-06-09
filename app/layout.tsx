import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Montserrat } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SessionGuardProvider } from "@/components/providers/session-guard-provider";
import { AppChrome } from "@/components/app-chrome";
import { WishBootShell } from "@/components/wish-boot-shell";
import { getMetaPixelInjectConfig } from "@/lib/meta-pixel-config-server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://wishtickets.net";
const OG_IMAGE_PATH = "/og-image.jpg";

/** Default document title & meta description (home + fallback for routes without their own metadata). */
const SITE_SEO_TITLE =
  "Wish Tickets Portal – Smart QR Ticketing System for Events in the Philippines";
const SITE_SEO_DESCRIPTION =
  "Secure ticketing platform with QR validation, real-time tracking, and admission control. Perfect for concerts and events.";

/** GA4 ID: unset → project default; empty / `0` / `false` → disabled (prod only). */
function resolveGaMeasurementId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (raw === undefined) return "G-DK0XXET3ZJ";
  const t = raw.trim();
  if (t === "" || t === "0" || t.toLowerCase() === "false") return null;
  return t;
}

const GA_MEASUREMENT_ID = resolveGaMeasurementId();
const ENABLE_GOOGLE_ANALYTICS =
  process.env.NODE_ENV === "production" && GA_MEASUREMENT_ID !== null;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a101f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_SEO_TITLE,
  description: SITE_SEO_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: "Wish Tickets Portal",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
    url: SITE_URL,
    siteName: "Wish Tickets Portal",
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Wish Tickets Portal",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const metaPixel = await getMetaPixelInjectConfig();

  // Default theme on HTML; inline script in <head> syncs from localStorage before paint.
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k='theme';var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'){t=document.documentElement.getAttribute('data-theme')||'light';}document.documentElement.setAttribute('data-theme',t);localStorage.setItem(k,t);}catch(e){}})();`,
          }}
        />
        {ENABLE_GOOGLE_ANALYTICS ? (
          <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="" />
        ) : null}
        {metaPixel ? (
          <link rel="preconnect" href="https://connect.facebook.net" crossOrigin="" />
        ) : null}
      </head>
      <body
        className={`${geistSans.variable} ${montserrat.variable} font-sans antialiased min-h-screen bg-background text-foreground flex flex-col`}
      >
        {ENABLE_GOOGLE_ANALYTICS ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-tag-gtag" strategy="afterInteractive">
              {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
            </Script>
          </>
        ) : null}
        {metaPixel ? (
          <>
            <Script id="meta-pixel-fbq" strategy="afterInteractive">
              {`
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixel.pixelId}');
fbq('track', 'PageView');
`}
            </Script>
            <noscript>
              {/* Meta Pixel noscript fallback; must be a plain img per Facebook */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                alt=""
                src={`https://www.facebook.com/tr?id=${metaPixel.pixelId}&ev=PageView&noscript=1`}
              />
            </noscript>
          </>
        ) : null}
        <WishBootShell />
        <div
          className="relative min-h-screen w-full"
          style={{ backgroundColor: "var(--app-bg-base)" }}
        >
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background: "var(--app-bg-overlay)",
            }}
          />
          <div className="relative z-10 min-h-screen">
            <QueryProvider>
              <ThemeProvider>
                <SessionGuardProvider>
                  <AppChrome>{children}</AppChrome>
                </SessionGuardProvider>
              </ThemeProvider>
            </QueryProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
