import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/access";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths — login UI, access API, config probe, Next internals.
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/access") ||
    pathname === "/api/config" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const unlocked = request.cookies.get(ACCESS_COOKIE)?.value === "1";
  if (unlocked) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
