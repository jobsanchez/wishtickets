import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseSessionCookieDefaults } from "@/lib/supabase/auth-cookie-options";

/** Supabase SSR auth cookies (`sb-*-auth-token`, optionally chunked). */
function hasSupabaseSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth-token")
  );
}

function pathnameRequiresAuthResolution(pathname: string): boolean {
  return (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname === "/login" ||
    pathname === "/signup"
  );
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  const pathname = request.nextUrl.pathname;

  // Guests on public routes: skip getUser + session_activity (major middleware savings).
  if (!hasSupabaseSessionCookie(request) && !pathnameRequiresAuthResolution(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    url,
    key,
    {
      cookieOptions: supabaseSessionCookieDefaults,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (user) {
    const { data: sessionRow } = await supabase
      .from("user_session_activity")
      .select("force_logout")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (sessionRow?.force_logout) {
      await supabase
        .from("user_session_activity")
        .upsert(
          {
            profile_id: user.id,
            logged_in: false,
            has_active_cart: false,
            in_paymongo_flow: false,
            force_logout: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id" }
        );
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Protected: dashboard (any authenticated user)
  if (pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Protected: admin (admin role checked in layout/API)
  if (pathname.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Admissions scan: public (code-based auth, no login required)

  // Auth pages: redirect home if already logged in
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
