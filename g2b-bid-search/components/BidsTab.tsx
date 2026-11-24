"use client";
// 탭 1: 진행 중 공고 (최근 7·14·30일 게시 공고 중 마감 전)
import { Fragment, useEffect, useMemo, useState } from "react";
import { addDays, nowKst, todayKst } from "@/lib/dates";
import { regionOf } from "@/lib/region";
import type { Bid, BidDetail, Industry } from "@/lib/types";
import { downloadXlsx } from "./exportXlsx";
import { errorText, getJson, isSoon, won } from "./format";
import { RegionSelect, SearchInput, SortTh, textMatch, useSort } from "./table";
import { useWindowedFetch } from "./useWindowedFetch";

const DAY_OPTIONS = [7, 14, 30];

/** 같은 공고번호는 가장 최근 차수만 남기고, 마감 전이며 취소되지 않은 공고만 고른다 */
export function openBids(all: Bid[], now: string) {
  const latest = new Map<string, Bid>();
  for (const b of all) {
    const cur = latest.get(b.no);
    if (!cur || b.ord > cur.ord) latest.set(b.no, b);
  }
  return [...latest.values()].filter((b) => !b.kind.includes("취소") && (b.closeDt || b.openDt) > now);
}

export default function BidsTab({ industry, onUsage }: { industry: Industry; onUsage: () => void }) {
  const [days, setDays] = useState(7);
  const { state, run } = useWindowedFetch<Bid>("/api/bids", onUsage);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [now, setNow] = useState(nowKst);

  useEffect(() => {
    const today = todayKst();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(nowKst());
    run(industry.cd, addDays(today, -(days - 1)), today);
  }, [industry.cd, days, run]);

  const open = useMemo(() => openBids(state.items, now), [state.items, now]);
  const regions = useMemo(() => new Set(open.map((b) => regionOf(b.dminstt))), [open]);
  const filtered = useMemo(
    () => open.filter((b) => textMatch(q, b.name, b.ntceInstt, b.dminstt, b.no) && (!region || regionOf(b.dminstt) === region)),
    [open, q, region],
  );
  const { sorted, sort, toggle } = useSort(
    filtered,
    {
      no: (b) => b.no,
      name: (b) => b.name,
      ntceInstt: (b) => b.ntceInstt,
      dminstt: (b) => b.dminstt,
      ntceDt: (b) => b.ntceDt,
      close: (b) => b.closeDt || b.openDt,
      openDt: (b) => b.openDt,
      price: (b) => b.price,
      cntrct: (b) => b.cntrct,
    },
    ["close", "asc"],
  );

  const cancelled = useMemo(() => state.items.filter((b) => b.kind.includes("취소")).length, [state.items]);

  function exportXlsx() {
    downloadXlsx(
      `g2b-bids-${industry.cd}-${todayKst()}.xlsx`,
      [
        { header: "공고번호", width: 20, value: (b: Bid) => `${b.no}-${b.ord}` },
        { header: "공고종류", width: 10, value: (b) => b.kind },
        { header: "공고명", width: 50, value: (b) => b.name },
        { header: "공고기관", width: 24, value: (b) => b.ntceInstt },
        { header: "수요기관", width: 28, value: (b) => b.dminstt },
        { header: "공고일시", width: 17, value: (b) => b.ntceDt },
        { header: "입찰마감일시", width: 20, value: (b) => b.closeDt || "공고문 확인(직찰 등)" },
        { header: "개찰일시", width: 17, value: (b) => b.openDt },
        { header: "추정가격(부가세 제외, 원)", width: 18, value: (b) => b.price },
        { header: "계약방법", width: 10, value: (b) => b.cntrct },
        { header: "낙찰방법", width: 30, value: (b) => b.sucsfMthd },
        { header: "나라장터 링크", width: 40, value: (b) => b.url },
      ],
      sorted,
      `${industry.cd} ${industry.nm} · 진행 중 공고 · 최근 ${days}일 게시 · 조회 ${now} · 출처: 조달청 나라장터 공공데이터 API`,
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="row" role="group" aria-label="공고 게시 기간">
          {DAY_OPTIONS.map((d) => (
            <button key={d} type="button" className={`btn seg${days === d ? " on" : ""}`} onClick={() => setDays(d)}>
              최근 {d}일
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="공고명·기관명·공고번호 검색" />
        <RegionSelect value={region} onChange={setRegion} regions={regions} />
        <button type="button" className="btn" onClick={exportXlsx} disabled={!sorted.length}>
          엑셀 내려받기
        </button>
      </div>

      {state.loading && (
        <div className="small muted" aria-live="polite">
          {state.total}개 구간 중 {state.done + 1}번째 구간 조회 중…
          <div className="progress">
            <span style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
          </div>
        </div>
      )}
      {Boolean(state.error) && <div className="notice error">{errorText(state.error)}</div>}

      {!state.loading && !state.error && (
        <p className="small muted" style={{ margin: "0 0 8px" }}>
          최근 {days}일 게시된 공고 {state.items.length}건(차수·취소 포함) 중 <b>마감 전 {open.length}건</b>
          {cancelled ? ` · 취소공고 ${cancelled}건 제외` : ""}
          {filtered.length !== open.length ? ` · 검색 결과 ${filtered.length}건` : ""}
        </p>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th aria-label="펼치기" />
              <SortTh k="no" label="공고번호" sort={sort} toggle={toggle} />
              <SortTh k="name" label="공고명" sort={sort} toggle={toggle} />
              <SortTh k="ntceInstt" label="공고기관" sort={sort} toggle={toggle} />
              <SortTh k="dminstt" label="수요기관" sort={sort} toggle={toggle} />
              <SortTh k="ntceDt" label="공고일시" sort={sort} toggle={toggle} />
              <SortTh k="close" label="입찰마감일시" sort={sort} toggle={toggle} />
              <SortTh k="openDt" label="개찰일시" sort={sort} toggle={toggle} />
              <SortTh k="price" label="추정가격(부가세 제외)" sort={sort} toggle={toggle} num />
              <SortTh k="cntrct" label="계약방법" sort={sort} toggle={toggle} />
              <th>낙찰방법</th>
              <th>링크</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const key = `${b.no}-${b.ord}`;
              const isOpen = openRow === key;
              return (
                <Fragment key={key}>
                  <tr className="main">
                    <td>
                      <button
                        type="button"
                        className="expander"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "상세 닫기" : "상세 보기"}
                        onClick={() => setOpenRow(isOpen ? null : key)}
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="nowrap">{key}</td>
                    <td className="name">
                      {b.name}
                      {b.kind && b.kind !== "등록공고" && <span className="tag">{b.kind}</span>}
                    </td>
                    <td className="org">{b.ntceInstt}</td>
                    <td className="org">{b.dminstt}</td>
                    <td className="nowrap">{b.ntceDt}</td>
                    <td className={`nowrap${isSoon(b.closeDt, now) ? " soon" : ""}`}>
                      {b.closeDt || <span className="tag warn">공고문 확인(직찰 등)</span>}
                    </td>
                    <td className="nowrap">{b.openDt}</td>
                    <td className="num">{won(b.price)}</td>
                    <td className="nowrap">{b.cntrct}</td>
                    <td className="method">{b.sucsfMthd}</td>
                    <td className="nowrap">
                      {b.url && (
                        <a href={b.url} target="_blank" rel="noreferrer">
                          나라장터
                        </a>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="expand">
                      <td />
                      <td colSpan={11}>
                        <BidDetailView bid={b} onUsage={onUsage} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!state.loading && !state.error && sorted.length === 0 && (
          <div className="empty">{open.length ? "검색 조건에 맞는 공고가 없습니다." : "마감 전인 공고가 없습니다."}</div>
        )}
      </div>
      <Footer fetchedAt={state.fetchedAt} cached={state.cachedWindows} total={state.total} />
    </div>
  );
}

function BidDetailView({ bid, onUsage }: { bid: Bid; onUsage: () => void }) {
  const [detail, setDetail] = useState<BidDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const c = new AbortController();
    getJson<BidDetail>(`/api/bids/detail?no=${bid.no}&ord=${bid.ord}`, c.signal)
      .then(setDetail, (e) => (e as Error).name !== "AbortError" && setError(e))
      .finally(onUsage);
    return () => c.abort();
  }, [bid.no, bid.ord, onUsage]);

  return (
    <dl className="detail-grid">
      <dt>참가가능지역</dt>
      <dd>{error ? errorText(error) : !detail ? "불러오는 중…" : detail.regions.length ? detail.regions.join(", ") : "지역 제한 없음"}</dd>
      <dt>면허(업종) 제한</dt>
      <dd>
        {error ? "-" : !detail ? "불러오는 중…" : detail.licenses.length ? detail.licenses.join(" / ") : "제한 없음"}
      </dd>
      <dt>배정예산</dt>
      <dd>{bid.budget ? `${won(bid.budget)}원` : "-"}</dd>
      <dt>첨부파일</dt>
      <dd>
        {bid.files.length ? (
          <ul className="files">
            {bid.files.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          "API에 첨부파일 정보 없음 (나라장터 상세에서 확인)"
        )}
      </dd>
    </dl>
  );
}

export function Footer({ fetchedAt, cached, total }: { fetchedAt: string; cached: number; total: number }) {
  return (
    <div className="foot">
      <div>
        출처: 조달청 나라장터 공공데이터 API
        {fetchedAt && ` · 조회 시각 ${fetchedAt}`}
        {total > 0 && cached > 0 && ` · ${total}개 구간 중 ${cached}개는 저장된 결과 사용`}
      </div>
      <div>업종 제한이 없는 공고(누구나 참가 가능)는 업종코드 검색에 나오지 않습니다. 나라장터 상세 페이지는 로그인이 필요합니다.</div>
      <div>추정가격은 부가세 제외 금액입니다(공고문 금액은 보통 부가세 포함).</div>
    </div>
  );
}
