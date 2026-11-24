// 사내용 접근 제한: SITE_PASSWORD 가 설정돼 있으면 로그인한 사람만 화면과 API를 쓸 수 있다.
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authEnabled, safeEqual, sessionToken } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const cookie = request.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(process.env.SITE_PASSWORD!))) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { kind: "auth", message: "로그인이 필요합니다." } }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
