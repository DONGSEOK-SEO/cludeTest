// 성남시 계약정보공개 '수의 계약현황' (contract.seongnam.go.kr, 안동시와 같은 cmios 시스템).
// 화면이 주는 보안 토큰(CMIOS_CSRF_TOKEN)과 세션 쿠키를 같이 보내야 한다. robots.txt 없음(2026-11-27 확인).
// 2026년 10월 비교: 홈페이지 323건 중 142건(대부분 2천만 원 이하 1인 견적)은 조달청 계약정보 API에 없었다.
import "server-only";
import { collectCmios, type CmiosSite } from "./cmios";

export const SEONGNAM_SOURCE = "seongnam_web";
export const SEONGNAM_PAGE = "https://contract.seongnam.go.kr/basis/optionalList.do";

const SITE: CmiosSite = {
  source: SEONGNAM_SOURCE,
  region: "성남",
  orgName: "경기도 성남시",
  label: "성남시",
  page: SEONGNAM_PAGE,
  ajax: "https://contract.seongnam.go.kr/basis/ajaxOptionalList.do",
  csrf: true,
  // "분당구청" → "분당구": 조달청 API 행(기관명 "경기도 성남시 분당구")과 같은 이름으로 맞춘다
  subName: (gov) => gov.replace(/^(수정|중원|분당)구청$/, "$1구"),
};

/** from, to: YYYYMMDD */
export function collectSeongnam(from: string, to: string, pageSize = 100) {
  return collectCmios(SITE, from, to, pageSize);
}
