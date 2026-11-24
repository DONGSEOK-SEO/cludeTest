"use client";
// 탭 2: 낙찰 결과 (개찰일 기준 1·3·6개월 또는 직접 지정)
import { Fragment, useEffect, useMemo, useState } from "react";
import { addDays, dash, dateCount, splitWindows, todayKst } from "@/lib/dates";
import { regionOf } from "@/lib/region";
import type { Award, Industry, NoticeInfo } from "@/lib/types";
import { Footer } from "./BidsTab";
import { downloadXlsx } from "./exportXlsx";
import { errorText, getJson, pct, shortWon, won } from "./format";
import { RegionSelect, SearchInput, SortTh, textMatch, useSort } from "./table";
import { useWindowedFetch } from "./useWindowedFetch";

type Period = "1m" | "3m" | "6m" | "custom";
const PERIODS: { k: Period; label: string; days: number }[] = [
  { k: "1m", label: "1개월", days: 30 },
  { k: "3m", label: "3개월", days: 90 },
  { k: "6m", label: "6개월", days: 182 },
];
const MAX_CUSTOM_DAYS = 366;

const awardKey = (a: Award) => `${a.no}|${a.ord}|${a.clsfcNo}|${a.rbidNo}`;
const g2bLink = (a: Award) => `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${a.no}&bidPbancOrd=${a.ord}`;
/** 사업자번호가 있으면 사업자번호로, 없으면 업체명으로 묶는다 */
const companyKey = (a: Award) => a.bizno || a.winner;

interface Company {
  key: string;
  name: string;
  bizno: string;
  count: number;
  sum: number;
  amtMissing: number;
  avgRate: number | null;
}

export default function AwardsTab({ industry, onUsage }: { industry: Industry; onUsage: () => void }) {
  const today = todayKst();
  const [period, setPeriod] = useState<Period>("1m");
  const [custom, setCustom] = useState({ from: dash(addDays(today, -30)), to: dash(today) });
  const [pending6m, setPending6m] = useState(false);
  const [customError, setCustomError] = useState("");
  const [range, setRange] = useState({ from: addDays(today, -30), to: today });
  const { state, run } = useWindowedFetch<Award>("/api/awards", onUsage);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [company, setCompany] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    run(industry.cd, range.from, range.to);
  }, [industry.cd, range, run]);

  function choosePeriod(p: Period) {
    setCustomError("");
    if (p === "custom") {
      setPeriod("custom");
      return;
    }
    const days = PERIODS.find((x) => x.k === p)!.days;
    if (p === "6m" && !pending6m) {
      setPending6m(true);
      return;
    }
    setPending6m(false);
    setPeriod(p);
    setCompany(null);
    setRange({ from: addDays(today, -days), to: today });
  }

  function applyCustom() {
    const from = custom.from.replaceAll("-", "");
    const to = custom.to.replaceAll("-", "");
    if (!from || !to || from > to) return setCustomError("시작일이 종료일보다 늦습니다.");
    if (to > today) return setCustomError("종료일은 오늘 이전이어야 합니다.");
    if (dateCount(from, to) > MAX_CUSTOM_DAYS) return setCustomError("한 번에 최대 1년까지 조회할 수 있습니다.");
    setCustomError("");
    setCompany(null);
    setRange({ from, to });
  }

  // 구간마다 겹쳐 오는 건을 없애고, 실제 개찰일이 조회 기간 밖인 결과는 뺀다
  // (API가 개찰 예정일 기준으로 찾는 듯, 실제 개찰이 미뤄진 결과가 앞 구간에 섞여 온다)
  const { awards, outside } = useMemo(() => {
    const m = new Map<string, Award>();
    for (const a of state.items) m.set(awardKey(a), a);
    const all = [...m.values()];
    const f = dash(range.from);
    const t = dash(range.to);
    const inRange = all.filter((a) => !a.openDt || (a.openDt.slice(0, 10) >= f && a.openDt.slice(0, 10) <= t));
    return { awards: inRange, outside: all.length - inRange.length };
  }, [state.items, range]);

  const regions = useMemo(() => new Set(awards.map((a) => regionOf(a.dminstt))), [awards]);
  const filtered = useMemo(
    () =>
      awards.filter(
        (a) =>
          textMatch(q, a.name, a.dminstt, a.winner, a.no, a.bizno) &&
          (!region || regionOf(a.dminstt) === region) &&
          (!company || companyKey(a) === company),
      ),
    [awards, q, region, company],
  );

  const summary = useMemo(() => {
    const amts = filtered.filter((a) => a.amt != null);
    const rates = filtered.filter((a) => a.rate != null);
    const cnts = filtered.filter((a) => a.cnt != null);
    return {
      count: filtered.length,
      sum: amts.reduce((s, a) => s + (a.amt ?? 0), 0),
      missing: filtered.length - amts.length,
      avgRate: rates.length ? rates.reduce((s, a) => s + (a.rate ?? 0), 0) / rates.length : null,
      avgCnt: cnts.length ? cnts.reduce((s, a) => s + (a.cnt ?? 0), 0) / cnts.length : null,
    };
  }, [filtered]);

  const companies = useMemo(() => {
    const m = new Map<string, Company & { rates: number[] }>();
    for (const a of awards.filter((x) => textMatch(q, x.name, x.dminstt, x.winner, x.no, x.bizno) && (!region || regionOf(x.dminstt) === region))) {
      const k = companyKey(a);
      const c = m.get(k) ?? { key: k, name: a.winner, bizno: a.bizno, count: 0, sum: 0, amtMissing: 0, avgRate: null, rates: [] };
      c.count++;
      if (a.amt != null) c.sum += a.amt;
      else c.amtMissing++;
      if (a.rate != null) c.rates.push(a.rate);
      m.set(k, c);
    }
    return [...m.values()]
      .map(({ rates, ...c }) => ({ ...c, avgRate: rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null }))
      .sort((a, b) => b.count - a.count || b.sum - a.sum);
  }, [awards, q, region]);

  const { sorted, sort, toggle } = useSort(
    filtered,
    {
      no: (a) => a.no,
      name: (a) => a.name,
      dminstt: (a) => a.dminstt,
      openDt: (a) => a.openDt,
      winner: (a) => a.winner,
      addr: (a) => a.addr,
      amt: (a) => a.amt,
      rate: (a) => a.rate,
      cnt: (a) => a.cnt,
    },
    ["openDt", "desc"],
  );
  const comp = useSort(
    companies,
    { name: (c) => c.name, count: (c) => c.count, sum: (c) => c.sum, avgRate: (c) => c.avgRate },
    ["count", "desc"],
  );

  const windows6m = splitWindows(addDays(today, -182), today).length;
  const selectedCompany = company ? companies.find((c) => c.key === company) : null;

  function exportXlsx() {
    const note = `${industry.cd} ${industry.nm} · 낙찰 결과 · 개찰일 ${dash(range.from)} ~ ${dash(range.to)}${
      selectedCompany ? ` · 업체: ${selectedCompany.name}` : ""
    } · 출처: 조달청 나라장터 공공데이터 API`;
    downloadXlsx(
      `g2b-awards-${industry.cd}-${range.from}-${range.to}.xlsx`,
      [
        { header: "공고번호", width: 20, value: (a: Award) => `${a.no}-${a.ord}` },
        { header: "공고명", width: 50, value: (a) => a.name },
        { header: "수요기관", width: 28, value: (a) => a.dminstt },
        { header: "개찰일시", width: 17, value: (a) => a.openDt },
        { header: "최종낙찰일", width: 12, value: (a) => a.fnlDate },
        { header: "낙찰업체", width: 28, value: (a) => a.winner },
        { header: "사업자번호", width: 14, value: (a) => a.bizno },
        { header: "대표자", width: 10, value: (a) => a.ceo },
        { header: "소재지", width: 30, value: (a) => a.addr },
        { header: "낙찰금액(원)", width: 15, value: (a) => a.amt ?? "금액 미제공(설계공모 등)" },
        { header: "낙찰률(%)", width: 10, value: (a) => a.rate ?? "낙찰률 없음", format: "0.000" },
        { header: "참가업체 수", width: 10, value: (a) => a.cnt },
        { header: "나라장터 링크", width: 40, value: (a) => g2bLink(a) },
      ],
      sorted,
      note,
    );
  }

  return (
    <div>
      <div className="toolbar">
        <div className="row" role="group" aria-label="개찰일 기간">
          {PERIODS.map((p) => (
            <button key={p.k} type="button" className={`btn seg${period === p.k ? " on" : ""}`} onClick={() => choosePeriod(p.k)}>
              {p.label}
            </button>
          ))}
          <button type="button" className={`btn seg${period === "custom" ? " on" : ""}`} onClick={() => choosePeriod("custom")}>
            직접 지정
          </button>
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="공고명·수요기관·업체명·사업자번호 검색" />
        <RegionSelect value={region} onChange={setRegion} regions={regions} />
        <button type="button" className="btn" onClick={exportXlsx} disabled={!sorted.length}>
          엑셀 내려받기
        </button>
      </div>

      {pending6m && (
        <div className="notice warn" role="alert">
          6개월 조회는 7일씩 나눠 약 {windows6m}번 API를 부릅니다(저장된 구간은 다시 부르지 않음). 하루 한도는 1,000회입니다.{" "}
          <button type="button" className="btn" onClick={() => choosePeriod("6m")}>
            계속 조회
          </button>{" "}
          <button type="button" className="btn" onClick={() => setPending6m(false)}>
            취소
          </button>
        </div>
      )}

      {period === "custom" && (
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="small">
            개찰일{" "}
            <input
              type="date"
              className="input"
              value={custom.from}
              max={dash(today)}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <span>~</span>
          <input
            type="date"
            className="input"
            aria-label="종료일"
            value={custom.to}
            max={dash(today)}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
          />
          <button type="button" className="btn primary" onClick={applyCustom}>
            조회
          </button>
          <span className="small muted">최대 1년 · 7일마다 1회 호출</span>
          {customError && <span className="small" style={{ color: "var(--danger)" }}>{customError}</span>}
        </div>
      )}

      {state.loading && (
        <div className="small muted" aria-live="polite">
          {state.total}개 구간 중 {state.done + 1}번째 구간 조회 중…
          <div className="progress">
            <span style={{ width: `${(state.done / Math.max(1, state.total)) * 100}%` }} />
          </div>
        </div>
      )}
      {Boolean(state.error) && <div className="notice error">{errorText(state.error)}</div>}

      <p className="small muted" style={{ margin: "0 0 8px" }}>
        개찰일 {dash(range.from)} ~ {dash(range.to)}
        {outside > 0 && ` · 실제 개찰일이 기간 밖인 ${outside}건 제외`}
        {selectedCompany && (
          <>
            {" · "}
            <b>{selectedCompany.name}</b>의 낙찰만 보는 중{" "}
            <button type="button" className="link-btn" onClick={() => setCompany(null)}>
              전체 보기
            </button>
          </>
        )}
      </p>

      <div className="cards">
        <div className="card">
          <div className="k">낙찰 건수</div>
          <div className="v">{summary.count.toLocaleString()}건</div>
        </div>
        <div className="card">
          <div className="k">낙찰금액 합계{summary.missing ? ` (금액 미제공 ${summary.missing}건 제외)` : ""}</div>
          <div className="v" title={`${won(summary.sum)}원`}>
            {shortWon(summary.sum)}
          </div>
        </div>
        <div className="card">
          <div className="k">평균 낙찰률</div>
          <div className="v">{summary.avgRate == null ? "-" : `${summary.avgRate.toFixed(2)}%`}</div>
        </div>
        <div className="card">
          <div className="k">평균 참가업체 수</div>
          <div className="v">{summary.avgCnt == null ? "-" : `${summary.avgCnt.toFixed(1)}곳`}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th aria-label="펼치기" />
              <SortTh k="no" label="공고번호" sort={sort} toggle={toggle} />
              <SortTh k="name" label="공고명" sort={sort} toggle={toggle} />
              <SortTh k="dminstt" label="수요기관" sort={sort} toggle={toggle} />
              <SortTh k="openDt" label="개찰일시" sort={sort} toggle={toggle} />
              <SortTh k="winner" label="낙찰업체" sort={sort} toggle={toggle} />
              <th>사업자번호</th>
              <th>대표자</th>
              <SortTh k="addr" label="소재지" sort={sort} toggle={toggle} />
              <SortTh k="amt" label="낙찰금액(원)" sort={sort} toggle={toggle} num />
              <SortTh k="rate" label="낙찰률(%)" sort={sort} toggle={toggle} num />
              <SortTh k="cnt" label="참가업체" sort={sort} toggle={toggle} num />
              <th>링크</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => {
              const key = awardKey(a);
              const isOpen = openRow === key;
              return (
                <Fragment key={key}>
                  <tr className="main">
                    <td>
                      <button
                        type="button"
                        className="expander"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "공고 정보 닫기" : "공고 정보 보기"}
                        onClick={() => setOpenRow(isOpen ? null : key)}
                      >
                        {isOpen ? "▼" : "▶"}
                      </button>
                    </td>
                    <td className="nowrap">
                      {a.no}-{a.ord}
                    </td>
                    <td className="name">{a.name}</td>
                    <td className="org">{a.dminstt}</td>
                    <td className="nowrap">{a.openDt}</td>
                    <td className="winner">
                      <button type="button" className="link-btn" onClick={() => setCompany(companyKey(a))} title="이 업체의 낙찰만 보기">
                        {a.winner}
                      </button>
                    </td>
                    <td className="nowrap">{a.bizno}</td>
                    <td className="nowrap">{a.ceo}</td>
                    <td className="addr">{a.addr}</td>
                    <td className="num">{a.amt != null ? won(a.amt) : <span className="tag warn">금액 미제공(설계공모 등)</span>}</td>
                    <td className="num">{a.rate != null ? pct(a.rate) : <span className="tag">낙찰률 없음</span>}</td>
                    <td className="num">{a.cnt ?? ""}</td>
                    <td className="nowrap">
                      <a href={g2bLink(a)} target="_blank" rel="noreferrer">
                        나라장터
                      </a>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="expand">
                      <td />
                      <td colSpan={12}>
                        <NoticeView award={a} onUsage={onUsage} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!state.loading && !state.error && sorted.length === 0 && (
          <div className="empty">{awards.length ? "검색 조건에 맞는 낙찰 결과가 없습니다." : "이 기간에 낙찰 결과가 없습니다."}</div>
        )}
      </div>

      <section className="agg" aria-labelledby="agg-title">
        <h3 id="agg-title">업체별 집계 ({companies.length.toLocaleString()}개 업체)</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <SortTh k="name" label="낙찰업체" sort={comp.sort} toggle={comp.toggle} />
                <th>사업자번호</th>
                <SortTh k="count" label="낙찰 건수" sort={comp.sort} toggle={comp.toggle} num />
                <SortTh k="sum" label="낙찰금액 합계(원)" sort={comp.sort} toggle={comp.toggle} num />
                <SortTh k="avgRate" label="평균 낙찰률(%)" sort={comp.sort} toggle={comp.toggle} num />
              </tr>
            </thead>
            <tbody>
              {comp.sorted.map((c) => (
                <tr key={c.key} className="main">
                  <td>
                    <button type="button" className="link-btn" onClick={() => setCompany(c.key)}>
                      {c.name}
                    </button>
                  </td>
                  <td className="nowrap">{c.bizno}</td>
                  <td className="num">{c.count}</td>
                  <td className="num">
                    {won(c.sum)}
                    {c.amtMissing > 0 && <span className="tag warn">미제공 {c.amtMissing}건</span>}
                  </td>
                  <td className="num">{c.avgRate == null ? "낙찰률 없음" : pct(c.avgRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Footer fetchedAt={state.fetchedAt} cached={state.cachedWindows} total={state.total} />
      <div className="foot">
        <div>
          낙찰정보 API에는 공고기관·계약방법·추정가격이 없어, 행을 펼치면 입찰공고 API에서 공고 정보를 불러옵니다(공고마다 1회 호출, 30일 저장).
        </div>
        <div>설계공모 등은 API가 낙찰금액을 0으로 주어 &quot;금액 미제공&quot;으로 표시하고 합계·평균에서 뺐습니다.</div>
      </div>
    </div>
  );
}

function NoticeView({ award, onUsage }: { award: Award; onUsage: () => void }) {
  const [info, setInfo] = useState<NoticeInfo | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const c = new AbortController();
    getJson<{ notice: NoticeInfo | null }>(`/api/notice?no=${award.no}&ord=${award.ord}`, c.signal)
      .then((r) => setInfo(r.notice), (e) => (e as Error).name !== "AbortError" && setError(e))
      .finally(onUsage);
    return () => c.abort();
  }, [award.no, award.ord, onUsage]);

  if (error) return <div className="small">{errorText(error)}</div>;
  if (info === undefined) return <div className="small muted">공고 정보 불러오는 중…</div>;
  if (info === null) return <div className="small muted">입찰공고 API에서 이 공고를 찾지 못했습니다.</div>;
  return (
    <dl className="detail-grid">
      <dt>공고기관</dt>
      <dd>{info.ntceInstt}</dd>
      <dt>계약방법</dt>
      <dd>{info.cntrct || "-"}</dd>
      <dt>낙찰방법</dt>
      <dd>{info.sucsfMthd || "-"}</dd>
      <dt>추정가격</dt>
      <dd>{info.price != null ? `${won(info.price)}원 (부가세 제외)` : "-"}</dd>
      <dt>배정예산</dt>
      <dd>{info.budget ? `${won(info.budget)}원` : "-"}</dd>
      <dt>공고일시</dt>
      <dd>
        {info.ntceDt} {info.kind && <span className="tag">{info.kind}</span>}
      </dd>
      <dt>최종낙찰일</dt>
      <dd>{award.fnlDate || "-"}</dd>
    </dl>
  );
}
