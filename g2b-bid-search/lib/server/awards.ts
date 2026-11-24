// 낙찰 결과: 업종코드 + 개찰일 구간(최대 7일)으로 조회
import "server-only";
import { addDays, normDateTime, nowKst, todayKst } from "../dates";
import type { Award, WindowResult } from "../types";
import { callAll, num, str } from "./g2b";
import { cacheGet, cacheSet } from "./store";

const OP = "getScsbidListSttusServcPPSSrch"; // 이 기능은 이름 끝에 02가 붙지 않는다

function bizno(v: unknown) {
  const d = str(v).replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : str(v);
}

export function toAward(r: Record<string, unknown>): Award {
  const amt = num(r.sucsfbidAmt);
  return {
    no: str(r.bidNtceNo),
    ord: str(r.bidNtceOrd),
    clsfcNo: str(r.bidClsfcNo),
    rbidNo: str(r.rbidNo),
    name: str(r.bidNtceNm),
    dminstt: str(r.dminsttNm),
    openDt: normDateTime(r.rlOpengDt),
    fnlDate: normDateTime(r.fnlSucsfDate),
    winner: str(r.bidwinnrNm), // 끝에 공백이 붙은 업체명이 있어 str()로 앞뒤 공백 제거
    bizno: bizno(r.bidwinnrBizno),
    ceo: str(r.bidwinnrCeoNm),
    addr: str(r.bidwinnrAdrs),
    amt: amt ? amt : null, // 설계공모 등은 0으로 온다
    rate: num(r.sucsfbidRate),
    cnt: num(r.prtcptCnum),
  };
}

export const awardKey = (a: Award) => `${a.no}|${a.ord}|${a.clsfcNo}|${a.rbidNo}`;

/** 오늘이 들어간 구간 1시간, 최근 2주 12시간(늦게 등록되는 결과 반영), 그 이전 30일 */
function ttlFor(to: string) {
  const today = todayKst();
  if (to >= today) return 3600;
  if (to >= addDays(today, -14)) return 12 * 3600;
  return 30 * 24 * 3600;
}

export async function getAwardWindow(code: string, from: string, to: string): Promise<WindowResult<Award>> {
  const key = `awards:${code}:${from}:${to}`;
  const hit = await cacheGet<WindowResult<Award>>(key);
  if (hit) return { ...hit, cached: true };
  const raw = await callAll("award", OP, {
    inqryDiv: "2",
    inqryBgnDt: `${from}0000`,
    inqryEndDt: `${to}2359`,
    indstrytyCd: code,
  });
  const seen = new Set<string>();
  const items: Award[] = [];
  for (const a of raw.map(toAward)) {
    const k = awardKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(a);
  }
  const result: WindowResult<Award> = { items, from, to, fetchedAt: nowKst(), cached: false };
  await cacheSet(key, result, ttlFor(to));
  return result;
}
