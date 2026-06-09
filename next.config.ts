import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import withSerwistInit from "@serwist/next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  /** Avoid SW cache pain during day-to-day dev. Production builds get the PWA. */
  disable: process.env.NODE_ENV === "development" || process.env.SERWIST_DISABLE === "1",
});

/**
 * Netlify runs `next/image` optimization in a serverless function; Sharp/IPX often returns
 * 502 (timeout, payload limit, or native binding issues), including for static `/public` files.
 * @see https://answers.netlify.com/search?q=next%20image%20502
 */
const disableImageOptimizer =
  process.env.NETLIFY === "true" || process.env.NEXT_IMAGE_UNOPTIMIZED === "1";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Other very large UI files (e.g. seat configurator ~96kB) can still log this; harmless.
    config.ignoreWarnings = [
      ...(Array.isArray(config.ignoreWarnings) ? config.ignoreWarnings : []),
      { message: /Serializing big strings/ },
    ];
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: "error",
    };
    return config;
  },
  experimental: {
    /** Tree-shake icon barrel imports (smaller client bundles on routes using lucide). */
    optimizePackageImports: ["lucide-react"],
  },
  // WARNING: Relaxed CSP – allows 'unsafe-eval' for scripts.
  // This quiets CSP eval warnings but weakens protection against XSS.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net",
              "script-src-elem 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net",
              "style-src 'self' 'unsafe-inline' https:",
              "img-src 'self' data: blob: https:",
              "media-src 'self' data: https:",
              "connect-src 'self' https: wss:",
              "font-src 'self' data: https:",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-src 'self' https:",
            ].join("; "),
          },
        ],
      },
    ];
  },
  images: {
    unoptimized: disableImageOptimizer,
    /** Allowed `quality` values for `<Image />` (Next.js 16 will require this). */
    qualities: [25, 50, 72, 75, 100],
    /**
     * Local `<Image />` sources must match a pattern (Next 15+). `/**` covers `/public` assets
     * (`/logo.webp`, …) and `/api/image-proxy?url=…` (omit `search` so query strings are allowed).
     * @see https://nextjs.org/docs/messages/next-image-unconfigured-localpatterns
     */
    localPatterns: [{ pathname: "/**" }],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withSerwist(withBundleAnalyzer(nextConfig));
