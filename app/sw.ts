/// <reference types="@serwist/next/typings" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Admissions UI (not `/api/admissions/*`). Cached so refresh works offline after one online visit. */
function isAdmissionsUiPath(pathname: string): boolean {
  return pathname === "/admissions" || pathname.startsWith("/admissions/");
}

/** Payment return/confirmation navigations should always be network-driven (no SW cache strategy). */
function isPaymentFlowPath(pathname: string): boolean {
  return (
    /^\/[^/]+\/payment-return\/[^/]+$/.test(pathname) ||
    /^\/[^/]+\/confirmation\/[^/]+$/.test(pathname)
  );
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  /**
   * Admissions GET APIs (especially offline-pack JSON) must not use cache-first / SWR:
   * mobile clients can otherwise see stale error bodies, opaque failures, or truncated
   * cached responses after flaky network.
   */
  runtimeCaching: [
    {
      matcher({ request, url, sameOrigin }) {
        return (
          sameOrigin &&
          request.method === "GET" &&
          url.pathname.startsWith("/api/admissions/")
        );
      },
      handler: new NetworkOnly(),
    },
    /**
     * Slug event payload for the book page must not be replayed from Serwist's default NetworkFirst
     * API cache — intermittent stale/missing `status` made `isBookableEvent` false while seats
     * sometimes still loaded.
     */
    {
      matcher({ request, url, sameOrigin }) {
        return (
          sameOrigin &&
          request.method === "GET" &&
          url.pathname === "/api/events" &&
          url.searchParams.has("slug")
        );
      },
      handler: new NetworkOnly(),
    },
    /**
     * Payment success redirects can be opened/closed quickly (popup return flow). Avoid NetworkFirst
     * document strategy here so transient fetch aborts do not surface `no-response` strategy errors.
     */
    {
      method: "GET",
      matcher({ request, url, sameOrigin }) {
        if (!sameOrigin || request.method !== "GET") return false;
        if (!isPaymentFlowPath(url.pathname)) return false;
        return request.mode === "navigate" || request.destination === "document";
      },
      handler: new NetworkOnly(),
    },
    /**
     * Document navigations + RSC flights for `/admissions/*` use a dedicated cache with a higher
     * entry budget than Serwist's generic `others` / `pages` buckets so the scan shell survives
     * eviction after browsing elsewhere. Requires at least one successful online load of the route.
     */
    {
      method: "GET",
      matcher({ request, url, sameOrigin }) {
        if (!sameOrigin || request.method !== "GET") return false;
        if (!isAdmissionsUiPath(url.pathname)) return false;
        const isRsc = request.headers.get("RSC") === "1";
        const isNavigation =
          request.mode === "navigate" || request.destination === "document";
        return isRsc || isNavigation;
      },
      handler: new NetworkFirst({
        cacheName: "admissions-pages-offline",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 24,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    ...(Array.isArray(defaultCache) ? defaultCache : []),
  ],
  disableDevLogs: true,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
