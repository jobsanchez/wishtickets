import type { MetadataRoute } from "next";

function siteBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const base = siteBase();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
