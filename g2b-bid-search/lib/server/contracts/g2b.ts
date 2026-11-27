// 조달청 공공데이터개방표준서비스 계약정보 API로 하루치 전국 계약을 받아, 대상 지자체의 수의계약만 넣는다.
// - 조회 기간은 실제로 하루만 된다(명세서의 '1주일'은 틀림, 2일 이상이면 오류 07).
// - 기관코드로 부르면 구청·읍면동·사업소마다 따로 불러야 해서, 전국을 받아 기관명으로 고르는 편이 호출이 적다(하루 약 7회).
// - 담당자·업체 연락처와 담당자 이름은 저장하지 않는다.
import "server-only";
import { matchRegion } from "../../contract-regions";
import { callAllParallel, num, str } from "../g2b";
import { formatBizno, linkWebDuplicates, markDay, upsertContracts, type ContractRow } from "./store";

/** 시 홈페이지에서도 받는 지자체: 같은 계약의 API 행을 홈페이지 행에 묶는다 */
const WEB_SOURCES = [
  ["안동", "andong_web"],
  ["성남", "seongnam_web"],
] as const;

const OP = "getDataSetOpnStdCntrctInfo";
export const G2B_SOURCE = "g2b_api";

function toRow(r: Record<string, unknown>): ContractRow | null {
  if (!str(r.cntrctCnclsMthdNm).includes("수의")) return null; // 수의계약만
  const byOrg = matchRegion(str(r.cntrctInsttNm));
  const byDemand = matchRegion(str(r.dmndInsttNm));
  const m = byOrg ?? byDemand;
  if (!m) return null;
  const date = str(r.cntrctCnclsDate).slice(0, 10).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    source: G2B_SOURCE,
    source_key: str(r.cntrctNo),
    source_ord: Number(str(r.cntrctOrd)) || 0,
    region: m.region,
    sub_region: m.sub,
    org_name: str(r.cntrctInsttNm) || null,
    org_code: str(r.cntrctInsttCd) || null,
    dept: str(r.cntrctInsttChrgDeptNm) || null,
    demand_org: str(r.dmndInsttNm) || null,
    title: str(r.cntrctNm),
    kind: str(r.bsnsDivNm) || null,
    method: str(r.cntrctCnclsMthdNm) || null,
    private_reason: str(r.prvtcntrctRsn) || null,
    amount: num(r.cntrctAmt),
    contract_date: date,
    period: str(r.cntrctPrd) || null,
    company: str(r.rprsntCorpNm) || null,
    bizno: formatBizno(r.rprsntCorpBizrno),
    bid_no: str(r.bidNtceNo) || null,
    url: str(r.cntrctInfoUrl) || null,
  };
}

/** day: YYYYMMDD. 반환: 전국 건수, 대상 수의계약 건수, 새로 넣은 건수, 호출 수 */
export async function collectG2bDay(day: string) {
  const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  try {
    const res = await callAllParallel("contract", OP, { cntrctCnclsBgnDate: day, cntrctCnclsEndDate: day });
    const all = res.items;
    if (all.length < res.totalCount) throw new Error(`${res.totalCount}건 중 ${all.length}건만 받음`);
    const rows = all.map(toRow).filter((x): x is ContractRow => Boolean(x && x.source_key));
    const added = await upsertContracts(rows);
    for (const [region, web] of WEB_SOURCES) if (rows.some((r) => r.region === region)) await linkWebDuplicates(region, web, iso, iso);
    const calls = res.pages;
    await markDay(G2B_SOURCE, iso, { status: "done", found: rows.length, added, calls });
    return { day, national: all.length, found: rows.length, added, calls };
  } catch (e) {
    await markDay(G2B_SOURCE, iso, { status: "error", error: (e as Error).message.slice(0, 300) });
    throw e;
  }
}
