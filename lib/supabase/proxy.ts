import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canRoleAccessPath, roleHome } from "@/lib/role-navigation";
import type { Role } from "@/lib/types";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/setup" ||
    pathname.startsWith("/auth/");

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!user) return response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    if (pathname !== "/setup") {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/setup";
      setupUrl.search = "";
      return NextResponse.redirect(setupUrl);
    }
    return response;
  }

  const role = profile.role as Role;
  const home = roleHome[role];

  if (profile.status !== "active") {
    if (pathname !== "/login") {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "?error=inactive";
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  if (pathname === "/login" || pathname === "/setup" || pathname === "/") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = home;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (!canRoleAccessPath(role, pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = home;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}