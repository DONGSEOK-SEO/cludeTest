import type { ApiErrorBody, ErrorKind } from "@/lib/types";

export const won = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("ko-KR"));

export const pct = (n: number | null | undefined) => (n == null ? "" : n.toFixed(3));

/** 1억 이상은 '억', 그 아래는 '만'으로 짧게 */
export function shortWon(n: number) {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억 원`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

export const ERROR_TITLES: Record<ErrorKind, string> = {
  key: "인증키 오류",
  unapproved: "활용 미승인",
  quota: "일일 호출 한도 초과",
  range: "조회 기간 오류",
  network: "일시적 연결 오류",
  api: "나라장터 API 오류",
  input: "입력 오류",
  auth: "로그인 필요",
};

export class FetchError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new FetchError("network", "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    // 로그인이 풀렸으면 화면(App)이 로그인 페이지로 보낸다
    if (res.status === 401) window.dispatchEvent(new Event("g2b:auth-required"));
    throw new FetchError(err?.kind ?? "api", err?.message ?? `요청이 실패했습니다(${res.status}).`);
  }
  return body as T;
}

export function errorText(e: unknown) {
  if (e instanceof FetchError) return `${ERROR_TITLES[e.kind]}: ${e.message}`;
  return (e as Error)?.message ?? "알 수 없는 오류";
}

/** 마감까지 남은 시간이 하루 안쪽이면 강조 */
export function isSoon(dt: string, now: string) {
  if (!dt) return false;
  const t = Date.parse(dt.replace(" ", "T") + ":00+09:00");
  const n = Date.parse(now.replace(" ", "T") + ":00+09:00");
  return t > n && t - n < 24 * 3600 * 1000;
}
