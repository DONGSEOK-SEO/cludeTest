// 안동시 홈페이지 '수의 계약현황' (cmios 시스템). robots.txt 는 /contract/ 경로를 막지 않는다(2026-11-25 확인).
import "server-only";
import { collectCmios, type CmiosSite } from "./cmios";

export const ANDONG_SOURCE = "andong_web";
export const ANDONG_PAGE = "https://www.andong.go.kr/contract/basis/optionalList.do";

const SITE: CmiosSite = {
  source: ANDONG_SOURCE,
  region: "안동",
  orgName: "경상북도 안동시",
  label: "안동시",
  page: ANDONG_PAGE,
  ajax: "https://www.andong.go.kr/contract/basis/ajaxOptionalList.do",
  csrf: false,
};

/** from, to: YYYYMMDD */
export function collectAndong(from: string, to: string, pageSize = 100) {
  return collectCmios(SITE, from, to, pageSize);
}
