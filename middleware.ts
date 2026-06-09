import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/login",
    "/signup",
    "/auth/:path*",
    /**
     * Refresh Supabase session cookies on navigations to public routes (home, event pages,
     * checkout, etc.) so long-lived tabs that never hit protected paths still get middleware refresh.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
