"use client";
// 업종 선택: 업종 API에서 받은 목록에서만 고른다. 이름·코드 일부로 걸러 보는 콤보박스 + 업종분류 필터.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { industryClasses, relatedIndustries, searchIndustries } from "@/lib/industry-shared";
import type { Industry, IndustryList } from "@/lib/types";

const RECENT_KEY = "g2b.recentIndustries";

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(code: string) {
  try {
    const next = [code, ...readRecent().filter((c) => c !== code)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

interface Props {
  list: IndustryList | null;
  listError: string;
  selected: Industry | null;
  favorites: string[];
  onSelect: (ind: Industry) => void;
}

export default function IndustryPicker({ list, listError, selected, favorites, onSelect }: Props) {
  const items = useMemo(() => list?.items ?? [], [list]);
  const byCode = useMemo(() => new Map(items.map((i) => [i.cd, i])), [items]);
  const classes = useMemo(() => industryClasses(items), [items]);
  const [query, setQuery] = useState("");
  const [className, setClassName] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // 브라우저 저장소는 화면이 뜬 뒤에 읽는다(서버 렌더와 어긋나지 않게)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecent(readRecent());
  }, []);

  const result = useMemo(() => searchIndustries(items, query, className, 50), [items, query, className]);

  function choose(ind: Industry) {
    setRecent(saveRecent(ind.cd));
    setQuery("");
    setOpen(false);
    onSelect(ind);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, result.items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && result.items[active]) {
        e.preventDefault();
        choose(result.items[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const chips = (codes: string[]) =>
    codes
      .map((c) => byCode.get(c))
      .filter((x): x is Industry => Boolean(x))
      .map((ind) => (
        <button
          key={ind.cd}
          type="button"
          className={`btn chip${selected?.cd === ind.cd ? " on" : ""}`}
          onClick={() => choose(ind)}
          title={`${ind.cn} · ${ind.law}`}
        >
          {ind.cd} {ind.nm}
        </button>
      ));

  const related = selected ? relatedIndustries(selected) : [];

  return (
    <section className="panel" aria-labelledby="picker-title">
      <h2 id="picker-title" className="sr-only">
        업종 선택
      </h2>
      <div className="picker">
        <div className="combo">
          <label htmlFor={`${listId}-input`} className="sr-only">
            업종 검색
          </label>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            className="input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && result.items[active] ? `${listId}-${active}` : undefined}
            placeholder={list ? "업종명이나 업종코드로 검색 (예: 건축사, 4817)" : "업종 목록을 불러오는 중…"}
            disabled={!list}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            autoComplete="off"
          />
          {open && list && (
            <ul className="combo-list" id={listId} role="listbox" ref={listRef}>
              {result.items.map((ind, i) => (
                <li
                  key={ind.cd}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(ind);
                  }}
                >
                  <div className="main">
                    <b>{ind.cd}</b>
                    {ind.nm}
                  </div>
                  <div className="meta">
                    {ind.cn}
                    {ind.law ? ` · ${ind.law}` : ""}
                  </div>
                </li>
              ))}
              {result.total === 0 && <li className="note">일치하는 업종이 없습니다</li>}
              {result.total > result.items.length && (
                <li className="note">
                  {result.total.toLocaleString()}개 중 {result.items.length}개만 보여 줍니다. 더 입력하거나 업종분류를 골라 주세요.
                </li>
              )}
            </ul>
          )}
        </div>
        <label>
          <span className="sr-only">업종분류</span>
          <select
            className="select"
            style={{ width: "100%", minHeight: 42 }}
            value={className}
            onChange={(e) => {
              setClassName(e.target.value);
              setActive(0);
              setOpen(true);
              inputRef.current?.focus();
            }}
            disabled={!list}
          >
            <option value="">업종분류 전체</option>
            {classes.map((c) => (
              <option key={c.cn} value={c.cn}>
                {c.cn} ({c.n})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <span className="small muted">자주 쓰는 업종</span>
        {chips(favorites)}
        {recent.filter((c) => !favorites.includes(c)).length > 0 && <span className="small muted" style={{ marginLeft: 8 }}>최근</span>}
        {chips(recent.filter((c) => !favorites.includes(c)))}
      </div>

      {listError && <div className="notice warn" style={{ marginTop: 10, marginBottom: 0 }}>{listError}</div>}

      {selected && (
        <div className="selected">
          <div className="title">
            <span>{selected.cd}</span>
            {selected.nm}
          </div>
          <div className="small">
            <span className="muted">업종분류</span> {selected.cn}
            {selected.law && (
              <>
                {" · "}
                <span className="muted">근거 법령</span>{" "}
                {selected.url ? (
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    {selected.law}
                  </a>
                ) : (
                  selected.law
                )}
              </>
            )}
          </div>
          {related.length > 0 && (
            <div className="small">
              <span className="muted">함께 인정되는 업종</span> {related.map((r) => `${r.cd} ${r.nm}`).join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="small muted" style={{ marginTop: 8 }}>
        업종 목록 {items.length.toLocaleString()}개 · 마지막 갱신 {list?.updatedAt ?? "-"}
        {list?.source === "seed" ? " (초기 데이터)" : ""}
      </div>
    </section>
  );
}
