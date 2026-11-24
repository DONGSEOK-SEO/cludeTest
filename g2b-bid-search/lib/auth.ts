// 사내용 접근 비밀번호. SITE_PASSWORD 환경 변수가 있을 때만 켜진다(로컬 개발에서는 보통 꺼 둠).
// 로그인하면 비밀번호에서 만든 토큰을 쿠키로 저장한다. 비밀번호를 바꾸면 기존 로그인이 모두 풀린다.

export const AUTH_COOKIE = "g2b_session";
export const AUTH_MAX_AGE = 30 * 24 * 3600;

export function authEnabled() {
  return Boolean(process.env.SITE_PASSWORD);
}

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("g2b-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 길이가 같을 때 끝까지 비교(시간차로 토큰을 알아내지 못하게) */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
