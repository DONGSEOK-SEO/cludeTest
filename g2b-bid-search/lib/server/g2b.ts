// 공공데이터포털(조달청 나라장터) API 호출 공통 부분: 인증키, 재시도, 오류 해석, 호출 수 집계
import "server-only";
import { todayKst } from "../dates";
import type { ErrorKind, Usage } from "../types";
import { getStore } from "./store";

export const SERVICES = {
  industry: "https://apis.data.go.kr/1230000/ao/IndstrytyBaseLawrgltInfoService",
  bid: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02",
  award: "https://apis.data.go.kr/1230000/as/ScsbidInfoService",
} as const;
export type Service = keyof typeof SERVICES;

/** 개발계정 일일 호출 한도(API별) */
export const DAILY_LIMIT = Number(process.env.DAILY_LIMIT || 1000);
/** 한 번에 받을 최대 건수. 999를 넘기면 API가 오류 없이 10건만 준다 */
export const PAGE_SIZE = 999;

export class G2BError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, [ErrorKind, string]> = {
  "30": ["key", "인증키가 등록되지 않았습니다. 서버의 DATA_GO_KR_KEY 값을 확인해 주세요."],
  "31": ["key", "인증키 사용 기간이 끝났습니다. 공공데이터포털에서 활용 연장 신청이 필요합니다."],
  "32": ["key", "등록되지 않은 도메인 또는 IP에서 호출했습니다."],
  "20": ["unapproved", "이 API의 활용신청이 승인되지 않았습니다. 공공데이터포털에서 승인 상태를 확인해 주세요."],
  "22": ["quota", "오늘 호출 한도를 모두 썼습니다. 내일 다시 조회하거나 운영계정 전환을 신청해 주세요."],
  "12": ["api", "API 주소가 잘못됐거나 폐기된 서비스입니다."],
  "07": ["range", "조회 기간이 API 허용 범위를 넘었습니다(최대 7일)."],
  "06": ["input", "날짜 형식이 잘못됐습니다."],
  "08": ["input", "필수 입력값이 빠졌습니다."],
  "11": ["input", "필수 입력값이 빠졌습니다."],
};

function apiError(code: string, raw: string): G2BError {
  const known = MESSAGES[code];
  if (known) return new G2BError(known[0], known[1], known[0] === "quota" ? 429 : 502);
  return new G2BError("api", `나라장터 API 오류(${code || "알 수 없음"}): ${raw.slice(0, 80)}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  if (!key) throw new G2BError("key", "서버에 DATA_GO_KR_KEY 환경 변수가 없습니다.", 500);
  return key;
}

export async function countCall(service: Service) {
  try {
    await getStore().incr(`calls:${service}:${todayKst()}`, 3 * 24 * 3600);
  } catch {
    /* 집계 실패는 무시 */
  }
}

export async function getUsage(): Promise<Usage> {
  const date = todayKst();
  const names: Service[] = ["industry", "bid", "award"];
  let nums = [0, 0, 0];
  try {
    nums = await getStore().getNumbers(names.map((s) => `calls:${s}:${date}`));
  } catch {
    /* 집계를 못 읽어도 0으로 표시 */
  }
  return { date, limit: DAILY_LIMIT, calls: { industry: nums[0], bid: nums[1], award: nums[2] } };
}

interface Page {
  items: Record<string, unknown>[];
  totalCount: number;
}

/**
 * API 한 페이지 호출. 연결 끊김·시간 초과는 지수 대기로 4번까지 재시도한다.
 * 응답 형식 세 가지를 처리: 정상(response), 나라장터 오류(nkoneps.com.response.ResponseError), 포털 공통 오류(OpenAPI_ServiceResponse)
 */
export async function callPage(service: Service, op: string, params: Record<string, string>): Promise<Page> {
  const q = new URLSearchParams({ serviceKey: getKey(), type: "json", ...params });
  const url = `${SERVICES[service]}/${op}?${q}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(1000 * 2 ** (attempt - 1));
    let text: string;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      await countCall(service); // 응답을 받은 호출만 센다
      text = await res.text();
    } catch (e) {
      lastErr = e;
      continue; // 연결 끊김, 시간 초과 → 재시도
    }
    return parse(text);
  }
  const cause = (lastErr as { cause?: { code?: string; message?: string } })?.cause;
  console.warn(`${service}/${op} 연결 실패:`, (lastErr as Error)?.message, cause?.code ?? cause?.message ?? "");
  throw new G2BError("network", "나라장터 API에 연결하지 못했습니다(일시적 오류). 잠시 후 다시 시도해 주세요.", 503);
}

function parse(text: string): Page {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(text);
  } catch {
    // 포털 공통 오류는 XML로 올 때가 있다
    const code = text.match(/<returnReasonCode>(\d+)</)?.[1] ?? text.match(/<resultCode>(\d+)</)?.[1] ?? "";
    throw apiError(code, text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  const portal = d["OpenAPI_ServiceResponse"] as { cmmMsgHeader?: Record<string, string> } | undefined;
  if (portal) {
    const h = portal.cmmMsgHeader ?? {};
    throw apiError(String(h.returnReasonCode ?? ""), String(h.returnAuthMsg ?? h.errMsg ?? ""));
  }
  const nk = d["nkoneps.com.response.ResponseError"] as { header?: Record<string, string> } | undefined;
  const root = (d["response"] ?? nk) as { header?: Record<string, string>; body?: Record<string, unknown> } | undefined;
  const code = String(root?.header?.resultCode ?? "");
  if (code === "03") return { items: [], totalCount: 0 }; // 데이터 없음
  if (code !== "00") throw apiError(code, String(root?.header?.resultMsg ?? text));
  const body = root?.body ?? {};
  let items = body.items as unknown;
  // XML→JSON 변환 형태({item: [...]}) 또는 단건 객체도 받아준다
  if (items && !Array.isArray(items) && typeof items === "object") items = (items as { item?: unknown }).item ?? [];
  if (items && !Array.isArray(items)) items = [items];
  return { items: (items as Record<string, unknown>[]) ?? [], totalCount: Number(body.totalCount ?? 0) };
}

/** 모든 페이지를 받아 합친다 */
export async function callAll(service: Service, op: string, params: Record<string, string>, maxPages = 20) {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await callPage(service, op, { ...params, numOfRows: String(PAGE_SIZE), pageNo: String(page) });
    all.push(...r.items);
    if (all.length >= r.totalCount || r.items.length < PAGE_SIZE) break;
  }
  return all;
}

export const str = (v: unknown) => String(v ?? "").trim();
export function num(v: unknown): number | null {
  const s = str(v).replaceAll(",", "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
