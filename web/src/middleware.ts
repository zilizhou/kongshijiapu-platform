import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "kj_session";

function secretKey() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const token = req.cookies.get(COOKIE)?.value;
  let ok = false;
  if (token) {
    try {
      await jwtVerify(token, secretKey());
      ok = true;
    } catch {
      ok = false;
    }
  }

  if (!ok && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (ok && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
