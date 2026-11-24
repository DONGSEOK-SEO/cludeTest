"use client";
// 표 공통: 열 정렬, 검색어·지역 필터
import { useMemo, useState } from "react";
import { REGION_ORDER } from "@/lib/region";

export type SortDir = "asc" | "desc";

export function useSort<T>(rows: T[], getters: Record<string, (r: T) => string | number | null>, initial: [string, SortDir]) {
  const [sort, setSort] = useState<[string, SortDir]>(initial);
  const sorted = useMemo(() => {
    const get = getters[sort[0]];
    if (!get) return rows;
    const dir = sort[1] === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      // 빈 값은 항상 맨 뒤
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y), "ko") * dir;
    });
    // getters 는 매번 새로 만들어지므로 정렬 기준과 행만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) => setSort(([k, d]) => (k === key ? [k, d === "asc" ? "desc" : "asc"] : [key, "asc"]));
  return { sorted, sort, toggle };
}

export function SortTh({
  k,
  label,
  sort,
  toggle,
  num,
}: {
  k: string;
  label: string;
  sort: [string, SortDir];
  toggle: (k: string) => void;
  num?: boolean;
}) {
  const on = sort[0] === k;
  return (
    <th className={num ? "num" : undefined} aria-sort={on ? (sort[1] === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggle(k)}>
        {label}
        {on ? (sort[1] === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
}

export function RegionSelect({ value, onChange, regions }: { value: string; onChange: (v: string) => void; regions: Set<string> }) {
  return (
    <label>
      <span className="sr-only">수요기관 지역</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} title="수요기관 이름으로 판단한 지역">
        <option value="">수요기관 지역 전체</option>
        {REGION_ORDER.filter((r) => regions.has(r)).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="input grow"
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
}

export const textMatch = (q: string, ...fields: string[]) => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => f.toLowerCase().includes(s));
};
