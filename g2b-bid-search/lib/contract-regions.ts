// 수의계약 DB 대상 지자체와 기관명 판별 (화면·서버 공용)

export const REGIONS = [
  { key: "서울", prefix: "서울특별시" },
  { key: "성남", prefix: "경기도 성남시" },
  { key: "수원", prefix: "경기도 수원시" },
  { key: "안동", prefix: "경상북도 안동시" },
  { key: "문경", prefix: "경상북도 문경시" },
] as const;

export type RegionKey = (typeof REGIONS)[number]["key"];

export const SEOUL_GU = [
  "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구", "서대문구",
  "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구", "서초구", "강남구", "송파구", "강동구",
];

/** 서울시 본청과 시 사업소를 묶어 부르는 이름 */
export const SEOUL_CITY = "서울시(본청·사업소)";

/**
 * 기관명이 대상 지자체 소속인지 판별한다. "서울특별시교육청"처럼 이름이 붙어 있는 다른 기관은 제외한다.
 * 반환: { region, sub } — sub 는 서울이면 구 이름(또는 본청·사업소), 다른 시는 구·읍면동·사업소 이름(없으면 "본청")
 */
export function matchRegion(name: string | null | undefined): { region: RegionKey; sub: string } | null {
  const s = (name ?? "").trim();
  for (const r of REGIONS) {
    if (s !== r.prefix && !s.startsWith(r.prefix + " ")) continue;
    const rest = s.slice(r.prefix.length).trim();
    const first = rest.split(/\s+/)[0] ?? "";
    if (r.key === "서울") return { region: r.key, sub: SEOUL_GU.includes(first) ? first : SEOUL_CITY };
    return { region: r.key, sub: first || "본청" };
  }
  return null;
}
