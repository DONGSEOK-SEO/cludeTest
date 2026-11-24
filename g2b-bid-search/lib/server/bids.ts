// 입찰공고: 업종코드 + 공고게시일 구간(최대 7일)으로 조회, 공고별 지역·면허 상세, 공고번호로 단건 조회
import "server-only";
import { normDateTime, nowKst, todayKst } from "../dates";
import type { Bid, BidDetail, NoticeInfo, WindowResult } from "../types";
import { callAll, callPage, num, str } from "./g2b";
import { cacheGet, cacheSet } from "./store";

const OP_SEARCH = "getBidPblancListInfoServcPPSSrch02";
const OP_LIST = "getBidPblancListInfoServc02";
const OP_REGION = "getBidPblancListInfoPrtcptPsblRgn02"; // 명세서 v1.3에는 02가 없지만 실제 이름은 02가 붙음
const OP_LICENSE = "getBidPblancListInfoLicenseLimit02";

export function toBid(r: Record<string, unknown>): Bid {
  const files = [];
  for (let i = 1; i <= 10; i++) {
    const url = str(r[`ntceSpecDocUrl${i}`]);
    if (url) files.push({ name: str(r[`ntceSpecFileNm${i}`]) || `첨부파일 ${i}`, url });
  }
  return {
    no: str(r.bidNtceNo),
    ord: str(r.bidNtceOrd),
    kind: str(r.ntceKindNm),
    name: str(r.bidNtceNm),
    ntceInstt: str(r.ntceInsttNm),
    dminstt: str(r.dminsttNm),
    ntceDt: normDateTime(r.bidNtceDt),
    closeDt: normDateTime(r.bidClseDt),
    openDt: normDateTime(r.opengDt),
    price: num(r.presmptPrce),
    budget: num(r.asignBdgtAmt),
    cntrct: str(r.cntrctCnclsMthdNm),
    sucsfMthd: str(r.sucsfbidMthdNm),
    url: str(r.bidNtceDtlUrl),
    files,
  };
}

/** 오늘이 들어간 구간은 1시간, 지난 구간은 12시간(정정·취소 공고 반영) 동안 저장 */
function ttlFor(to: string) {
  return to >= todayKst() ? 3600 : 12 * 3600;
}

export async function getBidWindow(code: string, from: string, to: string): Promise<WindowResult<Bid>> {
  const key = `bids:${code}:${from}:${to}`;
  const hit = await cacheGet<WindowResult<Bid>>(key);
  if (hit) return { ...hit, cached: true };
  const raw = await callAll("bid", OP_SEARCH, {
    inqryDiv: "1",
    inqryBgnDt: `${from}0000`,
    inqryEndDt: `${to}2359`,
    indstrytyCd: code,
  });
  const result: WindowResult<Bid> = { items: raw.map(toBid), from, to, fetchedAt: nowKst(), cached: false };
  await cacheSet(key, result, ttlFor(to));
  return result;
}

export async function getBidDetail(no: string, ord: string): Promise<BidDetail> {
  const key = `bid-detail:${no}:${ord}`;
  const hit = await cacheGet<BidDetail>(key);
  if (hit) return hit;
  const p = { inqryDiv: "2", bidNtceNo: no, bidNtceOrd: ord, numOfRows: "300", pageNo: "1" };
  // 업종 제한이 50개를 넘는 공고가 있어 300건을 한 번에 받는다
  const [reg, lic] = await Promise.all([callPage("bid", OP_REGION, p), callPage("bid", OP_LICENSE, p)]);
  const detail: BidDetail = {
    regions: [...new Set(reg.items.map((x) => str(x.prtcptPsblRgnNm)).filter(Boolean))].sort(),
    licenses: lic.items.map((x) => str(x.lcnsLmtNm)).filter(Boolean),
  };
  await cacheSet(key, detail, 24 * 3600);
  return detail;
}

/** 낙찰 행을 펼칠 때: 공고번호로 공고기관·계약방법·추정가격을 가져온다(공고 내용은 거의 바뀌지 않아 30일 저장) */
export async function getNoticeInfo(no: string, ord: string): Promise<NoticeInfo | null> {
  const key = `notice:${no}:${ord}`;
  const hit = await cacheGet<NoticeInfo | { none: true }>(key);
  if (hit) return "none" in hit ? null : hit;
  const r = await callPage("bid", OP_LIST, { inqryDiv: "2", bidNtceNo: no, numOfRows: "20", pageNo: "1" });
  const rows = r.items.map(toBid);
  const b = rows.find((x) => x.ord === ord) ?? rows.at(-1);
  if (!b) {
    await cacheSet(key, { none: true }, 24 * 3600);
    return null;
  }
  const info: NoticeInfo = {
    ntceInstt: b.ntceInstt,
    cntrct: b.cntrct,
    sucsfMthd: b.sucsfMthd,
    price: b.price,
    budget: b.budget,
    ntceDt: b.ntceDt,
    kind: b.kind,
    url: b.url,
  };
  await cacheSet(key, info, 30 * 24 * 3600);
  return info;
}
