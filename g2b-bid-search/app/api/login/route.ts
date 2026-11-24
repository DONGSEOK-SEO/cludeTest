import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, authEnabled, safeEqual, sessionToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const expected = process.env.SITE_PASSWORD!;
  if (!password || !safeEqual(await sessionToken(password), await sessionToken(expected))) {
    await new Promise((r) => setTimeout(r, 800)); // 연속 대입을 늦춘다
    return NextResponse.json({ error: { kind: "auth", message: "비밀번호가 맞지 않습니다." } }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });
  return res;
}
