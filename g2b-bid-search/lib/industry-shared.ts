// 업종 목록 검색과 포함면허 해석 (화면·서버 공용)
import type { Industry } from "./types";

/** 포함면허 원문에서 업종코드·업종명 쌍을 뽑는다. 자기 자신은 뺀다. */
export function relatedIndustries(ind: Industry): { cd: string; nm: string }[] {
  const out = new Map<string, string>();
  for (const group of ind.incl.match(/\[[^\]]*\]/g) ?? []) {
    let parts = group.slice(1, -1).split("^").map((p) => p.trim());
    // 맨 앞이 순번(숫자 1~3자리)이고 뒤에 코드·이름 쌍이 이어지면 순번을 버린다
    if (parts.length % 2 === 1 && /^\d{1,3}$/.test(parts[0])) parts = parts.slice(1);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const [cd, nm] = [parts[i], parts[i + 1]];
      if (/^\d{4}$/.test(cd) && cd !== ind.cd) out.set(cd, nm);
    }
  }
  return [...out].map(([cd, nm]) => ({ cd, nm }));
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 업종명·코드 검색. 코드 일치 → 코드 앞부분 → 이름 시작 → 이름 포함 순. className 은 업종분류명 */
export function searchIndustries(items: Industry[], query: string, className = "", limit = 50) {
  const q = norm(query);
  const pool = className ? items.filter((i) => i.cn === className) : items;
  if (!q) return { total: pool.length, items: pool.slice(0, limit) };
  const scored: [number, Industry][] = [];
  for (const it of pool) {
    const nm = norm(it.nm);
    let s = -1;
    if (it.cd === q) s = 0;
    else if (it.cd.startsWith(q)) s = 1;
    else if (nm.startsWith(q)) s = 2;
    else if (nm.includes(q)) s = 3;
    else if (norm(it.cn).includes(q)) s = 4;
    if (s >= 0) scored.push([s, it]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].cd.localeCompare(b[1].cd));
  return { total: scored.length, items: scored.slice(0, limit).map(([, it]) => it) };
}

/** 업종분류 목록 (이름순, 업종 수 포함). 분류코드가 달라도 이름이 같으면 하나로 묶는다(예: 과학·기술, 수산) */
export function industryClasses(items: Industry[]) {
  const m = new Map<string, { cn: string; n: number }>();
  for (const it of items) {
    const e = m.get(it.cn) ?? { cn: it.cn, n: 0 };
    e.n++;
    m.set(it.cn, e);
  }
  return [...m.values()].sort((a, b) => a.cn.localeCompare(b.cn, "ko"));
}
