// 지자체 계약정보공개(cmios) 시스템 공용 수집기. 안동시·성남시 홈페이지 '수의 계약현황'이 같은 시스템이다.
// 화면이 표 데이터를 받아 오는 요청(ajaxOptionalList.do, 본문은 JSON 문자열)을 그대로 보낸다. 요청 사이 1.5초 쉰다.
// 대표자 이름·업체 주소는 응답에 있지만 저장하지 않는다.
import "server-only";
import { formatBizno, linkWebDuplicates, markDays, upsertContracts, type ContractRow } from "./store";

export interface CmiosSite {
  source: string; // contracts.source 값
  region: string; // contracts.region 값 (안동/성남)
  orgName: string; // 기관 전체 이름
  label: string; // 오류 메시지에 쓰는 이름
  page: string; // 목록 화면 주소 (세션 쿠키·보안 토큰을 여기서 받는다)
  ajax: string; // 표 데이터 요청 주소
  csrf: boolean; // 화면의 CMIOS_CSRF_TOKEN 을 X-CSRF-TOKEN 헤더로 보내야 하는지
  subName?: (govNm: string) => string; // 계약부서명 → 기관(구·읍면동·사업소) 이름
}

const UA = "Mozilla/5.0 (compatible; buildtalk-research)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const ymd = (v: unknown) => {
  const d = s(v);
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
};

/** 목록 화면을 열어 세션 쿠키와(필요하면) 보안 토큰을 받는다. 연결이 자주 끊기는 사이트가 있어 몇 번 다시 시도한다 */
async function session(site: CmiosSite): Promise<{ cookie: string; token: string }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(site.page, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(30000) });
      const html = await res.text();
      const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
      const token = html.match(/CMIOS_CSRF_TOKEN\s*=\s*"([^"]+)"/)?.[1] ?? "";
      if (site.csrf && !token) throw new Error("보안 토큰을 찾지 못함");
      return { cookie, token };
    } catch (e) {
      if (attempt >= 3) throw new Error(`${site.label} 홈페이지 연결 실패: ${(e as Error).message}`);
      await sleep(3000 * 2 ** attempt);
    }
  }
}

function toRow(site: CmiosSite, r: Record<string, unknown>): ContractRow | null {
  const date = ymd(r.ctrtYmd);
  if (!date || !s(r.ctrtAcctBookMngNo)) return null;
  const end = ymd(r.ctrtEndYmd);
  const start = ymd(r.ctrtStartYmd);
  const gov = s(r.ctrtGovNm);
  return {
    source: site.source,
    source_key: s(r.ctrtAcctBookMngNo),
    source_ord: 0,
    region: site.region,
    sub_region: (gov && site.subName ? site.subName(gov) : gov) || "본청",
    org_name: site.orgName,
    org_code: null,
    dept: gov || null,
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
    url: site.page,
  };
}

/** from, to: YYYYMMDD. 기간 안의 모든 페이지를 받아 넣고, 같은 계약의 조달청 API 행을 묶고, 날짜별 수집 기록을 남긴다 */
export async function collectCmios(site: CmiosSite, from: string, to: string, pageSize = 100) {
  let { cookie, token } = await session(site);
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
        const res = await fetch(site.ajax, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            Referer: site.page,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(token ? { "X-CSRF-TOKEN": token } : {}),
          },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(60000),
        });
        calls++;
        const text = await res.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed.cmiosRtnCode !== "SUCC") throw new Error(`응답 오류 ${text.slice(0, 120)}`);
        d = parsed;
      } catch (e) {
        if (attempt === 3) throw new Error(`${site.label} 홈페이지 수집 실패(${page}쪽): ${(e as Error).message}`);
        await sleep(2000 * 2 ** attempt);
        // 세션이 끊겼을 수 있어 다시 받는다
        if (site.csrf) ({ cookie, token } = await session(site));
      }
    }
    if (!d) break;
    total = Number(d.totalCount) || 0;
    const list = (d.dataList as Record<string, unknown>[]) ?? [];
    all.push(...list);
    if (page >= (Number(d.totalPages) || 0) || !list.length) break;
    page++;
  }
  const rows = all.map((r) => toRow(site, r)).filter((x): x is ContractRow => Boolean(x));
  const added = await upsertContracts(rows);
  const f = `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}`;
  const t = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`;
  await linkWebDuplicates(site.region, site.source, f, t);
  const complete = total === all.length;
  // 날짜별 기록 (다 받았을 때만 '완료'로 남긴다)
  if (complete) {
    const perDay = new Map<string, number>();
    for (const r of rows) perDay.set(r.contract_date, (perDay.get(r.contract_date) ?? 0) + 1);
    const days: { day: string; found: number }[] = [];
    for (let d = new Date(`${f}T00:00:00Z`); d <= new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      days.push({ day: iso, found: perDay.get(iso) ?? 0 });
    }
    await markDays(site.source, days);
  }
  return { from, to, siteTotal: total, received: all.length, added, calls, complete };
}
