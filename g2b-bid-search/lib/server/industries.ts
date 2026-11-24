// 업종 목록: 하루 1회 업종 API에서 전체를 받아 저장. 실패하면 저장된 목록 → 초기 데이터 순으로 쓴다.
import "server-only";
import seed from "@/data/industries-seed.json";
import { nowKst } from "../dates";
import type { Industry, IndustryList } from "../types";
import { callAll, str } from "./g2b";
import { cacheGet, cacheSet } from "./store";

const KEY = "industries";
const FAIL_KEY = "industries:refresh-failed";
const REFRESH_MS = 24 * 3600 * 1000;

interface Stored extends IndustryList {
  fetchedAtMs: number;
}

function seedList(): IndustryList {
  return { updatedAt: seed.updatedAt, source: "seed", items: seed.items as Industry[] };
}

export async function fetchIndustriesFromApi(): Promise<Industry[]> {
  const raw = await callAll("industry", "getIndstrytyBaseLawrgltInfoList", {}, 5);
  return raw
    .filter((r) => (str(r.indstrytyUseYn) || "Y") === "Y")
    .map((r) => ({
      cd: str(r.indstrytyCd),
      nm: str(r.indstrytyNm),
      cc: str(r.indstrytyClsfcCd),
      cn: str(r.indstrytyClsfcNm),
      law: [str(r.baseLawordNm), str(r.baseLawordArtclClauseNm)].filter(Boolean).join(" "),
      url: str(r.baseLawordUrl),
      incl: str(r.inclsnLcns),
    }))
    .filter((r) => /^\d{4}$/.test(r.cd))
    .sort((a, b) => a.cd.localeCompare(b.cd));
}

/** force=true 이면 24시간이 안 지났어도 다시 받는다 */
export async function getIndustries(force = false): Promise<IndustryList & { refreshError?: string }> {
  const stored = await cacheGet<Stored>(KEY);
  if (stored && !force && Date.now() - stored.fetchedAtMs < REFRESH_MS) return strip(stored);
  // 방금 갱신에 실패했으면 10분 동안은 다시 시도하지 않는다(화면을 열 때마다 호출하지 않게)
  const recentFail = force ? null : await cacheGet<string>(FAIL_KEY);
  if (recentFail) return { ...(stored ? strip(stored) : seedList()), refreshError: recentFail };
  try {
    const items = await fetchIndustriesFromApi();
    // 너무 적게 오면 비정상 응답으로 보고 저장하지 않는다
    if (items.length < 1000) throw new Error(`업종이 ${items.length}개만 왔습니다`);
    const list: Stored = { updatedAt: nowKst(), source: "api", items, fetchedAtMs: Date.now() };
    await cacheSet(KEY, list, 30 * 24 * 3600);
    return strip(list);
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("업종 목록 갱신 실패:", msg);
    await cacheSet(FAIL_KEY, msg, 600);
    return { ...(stored ? strip(stored) : seedList()), refreshError: msg };
  }
}

function strip(s: Stored): IndustryList {
  return { updatedAt: s.updatedAt, source: s.source, items: s.items };
}

export async function findIndustry(code: string): Promise<Industry | undefined> {
  const list = await getIndustries();
  return list.items.find((i) => i.cd === code) ?? (seed.items as Industry[]).find((i) => i.cd === code);
}
