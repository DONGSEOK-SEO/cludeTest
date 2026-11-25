// 안동시 홈페이지 '수의 계약현황'이 표 데이터를 받아 오는 요청(ajaxOptionalList.do, JSON)을 그대로 보낸다.
// robots.txt 는 /contract/ 경로를 막지 않는다(2026-11-25 확인). 요청 사이 1.5초 쉰다.
// 대표자 이름·업체 주소는 응답에 있지만 저장하지 않는다.
import "server-only";
import { formatBizno, linkAndongDuplicates, markDays, upsertContracts, type ContractRow } from "./store";

const BASE = "https://www.andong.go.kr/contract";
const UA = "Mozilla/5.0 (compatible; buildtalk-research)";
export const ANDONG_SOURCE = "andong_web";
export const ANDONG_PAGE = `${BASE}/basis/optionalList.do`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const ymd = (v: unknown) => {
  const d = s(v);
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
};

async function session(): Promise<string> {
  const res = await fetch(ANDONG_PAGE, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(30000) });
  await res.text();
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function toRow(r: Record<string, unknown>): ContractRow | null {
  const date = ymd(r.ctrtYmd);
  if (!date || !s(r.ctrtAcctBookMngNo)) return null;
  const end = ymd(r.ctrtEndYmd);
  const start = ymd(r.ctrtStartYmd);
  return {
    source: ANDONG_SOURCE,
    source_key: s(r.ctrtAcctBookMngNo),
    source_ord: 0,
    region: "안동",
    sub_region: s(r.ctrtGovNm) || "본청",
    org_name: "경상북도 안동시",
    org_code: null,
    dept: s(r.ctrtGovNm) || null,
    demand_org: null,
    title: s(r.ctrtNm),
    kind: s(r.ctrtKind) || null,
    method: s(r.ctrtMeth) || null,
    private_reason: null,
    amount: Number(r.ctrtAmt) || null,
    contract_date: date,
    period: start || end ? `${start || date} ~ ${end}` : null,
    company: s(r.custNm) || null,
    bizno: formatBizno(r.bizRegiNo),
    bid_no: null,
    url: ANDONG_PAGE,
  };
}

/** from, to: YYYYMMDD. 기간 안의 모든 페이지를 받아 넣고, 날짜별 수집 기록을 남긴다 */
export async function collectAndong(from: string, to: string, pageSize = 100) {
  const cookie = await session();
  const all: Record<string, unknown>[] = [];
  let page = 1;
  let total = 0;
  let calls = 1;
  for (;;) {
    await sleep(1500);
    const body = JSON.stringify({
      page, rowNum: pageSize, ctrtGovCd: "", ctrtNm: "", custNm: "", ctrtKindCd: "", ctrtAmtFr: "", ctrtAmtTo: "",
      ctrtYmdFr: from, ctrtYmdTo: to, ctrtMethCd: "",
    });
    let d: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 4 && !d; attempt++) {
      try {
        const res = await fetch(`${BASE}/basis/ajaxOptionalList.do`, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Referer: ANDONG_PAGE,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
        });
        calls++;
        d = JSON.parse(await res.text());
      } catch (e) {
        if (attempt === 3) throw new Error(`안동시 홈페이지 연결 실패: ${(e as Error).message}`);
        await sleep(2000 * 2 ** attempt);
      }
    }
    if (!d || d.cmiosRtnCode !== "SUCC") throw new Error(`안동시 응답 오류: ${JSON.stringify(d).slice(0, 200)}`);
    total = Number(d.totalCount) || 0;
    const list = (d.dataList as Record<string, unknown>[]) ?? [];
    all.push(...list);
    if (page >= (Number(d.totalPages) || 0) || !list.length) break;
    page++;
  }
  const rows = all.map(toRow).filter((x): x is ContractRow => Boolean(x));
  const added = await upsertContracts(rows);
  const f = `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}`;
  const t = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`;
  await linkAndongDuplicates(f, t);
  // 날짜별 기록
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.contract_date, (perDay.get(r.contract_date) ?? 0) + 1);
  const days: { day: string; found: number }[] = [];
  for (let d = new Date(`${f}T00:00:00Z`); d <= new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    days.push({ day: iso, found: perDay.get(iso) ?? 0 });
  }
  await markDays(ANDONG_SOURCE, days);
  return { from, to, siteTotal: total, received: all.length, added, calls, complete: total === all.length };
}
