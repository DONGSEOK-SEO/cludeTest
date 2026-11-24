// 한국시간(KST) 날짜 계산. 서버(Vercel은 UTC)와 브라우저 어디서든 같은 결과가 나오게 UTC 기준으로 9시간을 더해 계산한다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 지금 한국시간을 'YYYY-MM-DD HH:MM' 으로 */
export function nowKst(): string {
  const d = new Date(Date.now() + KST_OFFSET_MS);
  return `${ymdDash(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** 오늘(한국시간) 'YYYYMMDD' */
export function todayKst(): string {
  return nowKst().slice(0, 10).replaceAll("-", "");
}

/** 'YYYYMMDD' 에 days 일을 더한 날짜 */
export function addDays(ymd: string, days: number): string {
  const t = Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) + days * DAY_MS;
  return ymdDash(new Date(t)).replaceAll("-", "");
}

/** 두 날짜 사이 달력 날짜 수(양 끝 포함) */
export function dateCount(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(4, 6) - 1, +to.slice(6, 8));
  return Math.round((b - a) / DAY_MS) + 1;
}

export function isYmd(s: string | null | undefined): s is string {
  if (!s || !/^\d{8}$/.test(s)) return false;
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  return ymdDash(d).replaceAll("-", "") === s;
}

/** 'YYYYMMDD' → 'YYYY-MM-DD' */
export function dash(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

/** API 날짜 문자열을 'YYYY-MM-DD HH:MM' 또는 'YYYY-MM-DD' 로 맞춘다. 비어 있으면 '' */
export function normDateTime(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[ T]?(\d{2}):?(\d{2}))?/);
  if (!m) return s;
  return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * 조회 기간을 API 한도(달력 날짜 7일)에 맞게 나눈다. 구간은 00:00~23:59 단위.
 * 정오에서 시작하는 7일 구간은 8개 날짜에 걸쳐 오류(07)가 나므로 반드시 날짜 경계로 자른다.
 */
export function splitWindows(from: string, to: string, size = 7): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let s = from;
  while (s <= to) {
    let e = addDays(s, size - 1);
    if (e > to) e = to;
    out.push({ from: s, to: e });
    s = addDays(e, 1);
  }
  return out;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymdDash(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
