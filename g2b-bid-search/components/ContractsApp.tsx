"use client";
// 지자체 수의계약 조회 화면 (서울·성남·수원·안동·문경). DB에 쌓인 데이터만 읽는다.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { REGIONS, SEOUL_CITY, SEOUL_GU } from "@/lib/contract-regions";
import { SOURCE_LABEL, type ContractItem, type ContractListResult } from "@/lib/contract-types";
import { addDays, dash, todayKst } from "@/lib/dates";
import { downloadXlsx } from "./exportXlsx";
import { errorText, getJson, shortWon, won } from "./format";
import SiteNav from "./SiteNav";

type Period = "1m" | "3m" | "1y" | "2y" | "custom";
const PERIODS: { k: Period; label: string; days: number }[] = [
  { k: "1m", label: "최근 1개월", days: 30 },
  { k: "3m", label: "3개월", days: 91 },
  { k: "1y", label: "1년", days: 365 },
  { k: "2y", label: "2년", days: 730 },
];

interface Filters {
  region: string;
  sub: string;
  period: Period;
  from: string;
  to: string;
  kind: string;
  method: string;
  q: string;
  company: string;
  min: string;
  max: string;
  sort: "date" | "amount";
}

function periodRange(p: Period, f: Filters) {
  if (p === "custom") return { from: f.from, to: f.to };
  const today = todayKst();
  const days = PERIODS.find((x) => x.k === p)!.days;
  return { from: dash(addDays(today, -(days - 1))), to: dash(today) };
}

// 일부 브라우저가 한글 파일 이름을 "download"로 바꿔서 파일 이름은 영문으로
const REGION_FILE: Record<string, string> = { 서울: "seoul", 성남: "seongnam", 수원: "suwon", 안동: "andong", 문경: "mungyeong" };

const num = (v: string | number | null) => (v == null || v === "" ? null : Number(v));

export default function ContractsApp({ authEnabled }: { authEnabled: boolean }) {
  const router = useRouter();
  const today = dash(todayKst());
  const [f, setF] = useState<Filters>({
    region: "", sub: "", period: "3m", from: dash(addDays(todayKst(), -90)), to: today, kind: "", method: "", q: "", company: "",
    min: "", max: "", sort: "date",
  });
  const [applied, setApplied] = useState(f);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ContractListResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const toLogin = () => router.push("/login");
    window.addEventListener("g2b:auth-required", toLogin);
    return () => window.removeEventListener("g2b:auth-required", toLogin);
  }, [router]);

  const queryString = useCallback(
    (x: Filters, pg: number, extra: Record<string, string> = {}) => {
      const { from, to } = periodRange(x.period, x);
      const p = new URLSearchParams({ page: String(pg), sort: x.sort, ...extra });
      const set = (k: string, v: string) => v && p.set(k, v);
      set("region", x.region);
      set("sub", x.region === "서울" ? x.sub : "");
      set("from", from);
      set("to", to);
      set("kind", x.kind);
      set("method", x.method);
      set("q", x.q.trim());
      set("company", x.company.trim());
      set("min", x.min.replace(/,/g, ""));
      set("max", x.max.replace(/,/g, ""));
      return p.toString();
    },
    [],
  );

  useEffect(() => {
    const c = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    getJson<ContractListResult>(`/api/contracts?${queryString(applied, page)}`, c.signal)
      .then(setData, (e) => (e as Error).name !== "AbortError" && setError(e))
      .finally(() => setLoading(false));
    return () => c.abort();
  }, [applied, page, queryString]);

  // 칩·선택 상자는 바로 적용, 글자 입력은 [조회] 또는 Enter 로 적용
  function apply(patch: Partial<Filters> = {}) {
    const next = { ...f, ...patch };
    setF(next);
    setApplied(next);
    setPage(1);
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const r = await getJson<{ rows: ContractItem[]; truncated: boolean; limit: number }>(
        `/api/contracts?${queryString(applied, 1, { export: "1" })}`,
      );
      const { from, to } = periodRange(applied.period, applied);
      await downloadXlsx(
        `private-contracts-${REGION_FILE[applied.region] ?? "all"}-${from}-${to}.xlsx`,
        [
          { header: "계약일", width: 11, value: (c: ContractItem) => c.contract_date },
          { header: "지자체", width: 8, value: (c) => c.region },
          { header: "기관(구·읍면동·사업소)", width: 18, value: (c) => c.sub_region },
          { header: "부서", width: 18, value: (c) => c.dept },
          { header: "계약명", width: 50, value: (c) => c.title },
          { header: "구분", width: 6, value: (c) => c.kind },
          { header: "계약방법", width: 14, value: (c) => c.method },
          { header: "수의계약 사유", width: 40, value: (c) => c.private_reason },
          { header: "계약금액(원)", width: 14, value: (c) => num(c.amount) },
          { header: "계약기간", width: 22, value: (c) => c.period },
          { header: "업체명", width: 24, value: (c) => c.company },
          { header: "사업자번호", width: 14, value: (c) => c.bizno },
          { header: "출처", width: 16, value: (c) => SOURCE_LABEL[c.source] ?? c.source },
          { header: "원문 링크", width: 40, value: (c) => c.url },
        ],
        r.rows,
        `지자체 수의계약 · ${applied.region || "전체"}${applied.sub ? " " + applied.sub : ""} · 계약일 ${from} ~ ${to}${
          r.truncated ? ` · 최근 ${r.limit.toLocaleString()}건만` : ""
        } · 출처: 조달청 계약정보 API, 안동시·성남시 홈페이지`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  const { from, to } = periodRange(applied.period, applied);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const onEnter = (e: React.KeyboardEvent) => e.key === "Enter" && apply();

  return (
    <>
      <header className="brandbar">
        <div className="brandbar-inner">
          <div className="brand">
            <span className="logo">빌드톡</span>
            <span className="brand-divider" aria-hidden="true" />
            <h1>지자체 수의계약</h1>
            <SiteNav active="contracts" />
          </div>
          {authEnabled && (
            <div className="usage">
              <button type="button" className="btn chip" onClick={logout}>
                로그아웃
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="wrap">
        <p className="intro">서울(본청·25개 구), 성남, 수원, 안동, 문경의 수의계약을 모아 보여 줍니다. 매주 월요일 새벽에 최근 2주를 다시 받아 갱신합니다.</p>

        <section className="panel filters" aria-label="검색 조건">
          <div className="filter-row">
            <span className="label">지자체</span>
            {[{ key: "", label: "전체" }, ...REGIONS.map((r) => ({ key: r.key, label: r.key }))].map((r) => (
              <button key={r.key} type="button" className={`btn seg${applied.region === r.key ? " on" : ""}`} onClick={() => apply({ region: r.key, sub: "" })}>
                {r.label}
              </button>
            ))}
            {applied.region === "서울" && (
              <select className="select" value={applied.sub} onChange={(e) => apply({ sub: e.target.value })} aria-label="서울 구">
                <option value="">서울 전체</option>
                <option value={SEOUL_CITY}>{SEOUL_CITY}</option>
                {SEOUL_GU.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="filter-row">
            <span className="label">계약일</span>
            {PERIODS.map((p) => (
              <button key={p.k} type="button" className={`btn seg${applied.period === p.k ? " on" : ""}`} onClick={() => apply({ period: p.k })}>
                {p.label}
              </button>
            ))}
            <button type="button" className={`btn seg${f.period === "custom" ? " on" : ""}`} onClick={() => setF({ ...f, period: "custom" })}>
              직접 지정
            </button>
            {f.period === "custom" && (
              <>
                <input type="date" className="input" value={f.from} max={today} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="시작일" />
                <span>~</span>
                <input type="date" className="input" value={f.to} max={today} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="종료일" />
              </>
            )}
          </div>
          <div className="filter-row">
            <span className="label">구분</span>
            <select className="select" value={f.kind} onChange={(e) => apply({ kind: e.target.value })} aria-label="구분">
              <option value="">공사·물품·용역 전체</option>
              <option value="공사">공사</option>
              <option value="물품">물품</option>
              <option value="용역">용역</option>
            </select>
            <select className="select" value={f.method} onChange={(e) => apply({ method: e.target.value })} aria-label="계약방법">
              <option value="">계약방법 전체</option>
              {(data?.methods ?? []).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="label" style={{ minWidth: 0, marginLeft: 8 }}>
              금액
            </span>
            <input className="input num" inputMode="numeric" placeholder="최소(원)" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} onKeyDown={onEnter} aria-label="최소 금액" />
            <span>~</span>
            <input className="input num" inputMode="numeric" placeholder="최대(원)" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} onKeyDown={onEnter} aria-label="최대 금액" />
          </div>
          <div className="filter-row">
            <span className="label">검색</span>
            <input className="input" style={{ flex: "1 1 220px" }} placeholder="계약명 (예: 설계, 감리)" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} onKeyDown={onEnter} aria-label="계약명" />
            <input className="input" style={{ flex: "1 1 220px" }} placeholder="업체명 또는 사업자번호" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} onKeyDown={onEnter} aria-label="업체명 또는 사업자번호" />
            <button type="button" className="btn primary" onClick={() => apply()}>
              조회
            </button>
            <button type="button" className="btn" onClick={exportXlsx} disabled={exporting || !data?.total}>
              {exporting ? "만드는 중…" : "엑셀 내려받기"}
            </button>
          </div>
        </section>

        {Boolean(error) && <div className="notice error">{errorText(error)}</div>}

        <section className="panel">
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            {applied.region || "전체 지자체"}
            {applied.sub ? ` · ${applied.sub}` : ""} · 계약일 {from} ~ {to}
            {loading && " · 불러오는 중…"}
          </p>
          <div className="cards">
            <div className="card">
              <div className="k">수의계약 건수</div>
              <div className="v">{(data?.total ?? 0).toLocaleString()}건</div>
            </div>
            <div className="card">
              <div className="k">계약금액 합계</div>
              <div className="v" title={`${won(data?.sum ?? 0)}원`}>
                {shortWon(data?.sum ?? 0)}
              </div>
            </div>
            <div className="card">
              <div className="k">평균 금액</div>
              <div className="v">{shortWon(data?.avg ?? 0)}</div>
            </div>
            <div className="card">
              <div className="k">업체 수</div>
              <div className="v">{(data?.companyCount ?? 0).toLocaleString()}곳</div>
            </div>
          </div>

          <div className="toolbar">
            <span className="small muted">정렬</span>
            <button type="button" className={`btn seg${applied.sort === "date" ? " on" : ""}`} onClick={() => apply({ sort: "date" })}>
              최신순
            </button>
            <button type="button" className={`btn seg${applied.sort === "amount" ? " on" : ""}`} onClick={() => apply({ sort: "amount" })}>
              금액순
            </button>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>계약일</th>
                  <th>지자체·기관</th>
                  <th>부서</th>
                  <th>계약명</th>
                  <th>구분</th>
                  <th>계약방법</th>
                  <th>수의계약 사유</th>
                  <th className="num">금액(원)</th>
                  <th>업체명</th>
                  <th>사업자번호</th>
                  <th>출처</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((c) => (
                  <tr key={c.id} className="main">
                    <td className="nowrap">{c.contract_date}</td>
                    <td className="org">
                      {c.region}
                      {c.sub_region && c.sub_region !== "본청" ? ` · ${c.sub_region}` : ""}
                    </td>
                    <td className="org">{c.dept}</td>
                    <td className="name">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.title}
                        </a>
                      ) : (
                        c.title
                      )}
                    </td>
                    <td className="nowrap">{c.kind}</td>
                    <td className="nowrap">{c.method}</td>
                    <td className="reason">{c.private_reason}</td>
                    <td className="num">{won(num(c.amount))}</td>
                    <td className="winner">
                      <button type="button" className="link-btn" onClick={() => apply({ company: c.bizno || c.company || "" })} title="이 업체의 계약만 보기">
                        {c.company}
                      </button>
                    </td>
                    <td className="nowrap">{c.bizno}</td>
                    <td className="nowrap small">{SOURCE_LABEL[c.source] ?? c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && data && data.total === 0 && <div className="empty">조건에 맞는 수의계약이 없습니다.</div>}
          </div>
          {pages > 1 && (
            <div className="pager">
              <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                이전
              </button>
              <span className="small">
                {page.toLocaleString()} / {pages.toLocaleString()} 쪽
              </span>
              <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                다음
              </button>
            </div>
          )}

          <section className="agg" aria-labelledby="c-agg">
            <h3 id="c-agg">업체별 집계 (건수 많은 순 상위 100곳)</h3>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>업체명</th>
                    <th>사업자번호</th>
                    <th className="num">계약 건수</th>
                    <th className="num">금액 합계(원)</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.companies ?? []).map((c) => (
                    <tr key={`${c.bizno}-${c.company}`} className="main">
                      <td>
                        <button type="button" className="link-btn" onClick={() => apply({ company: c.bizno || c.company || "" })}>
                          {c.company}
                        </button>
                      </td>
                      <td className="nowrap">{c.bizno}</td>
                      <td className="num">{c.n.toLocaleString()}</td>
                      <td className="num">{won(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="foot">
            <div>
              마지막 수집:{" "}
              {(data?.sources ?? []).length
                ? data!.sources.map((s) => `${SOURCE_LABEL[s.source] ?? s.source} ${s.last_day ?? "-"}까지 (${s.last_update ?? "-"} 갱신)`).join(" · ")
                : "아직 없음"}
            </div>
            <div>조달청 계약정보 API는 나라장터를 거친 계약만 담겨, 소액 1인 견적 수의계약이 빠질 수 있습니다(안동시 비교 시 1인 견적의 43%만 포함).</div>
            <div>안동시·성남시는 시 홈페이지(1인 견적 포함)와 조달청 API를 합쳤고, 같은 계약(사업자번호·금액 일치)은 한 번만 셉니다. 문경시는 홈페이지가 해외 서버 접속을 막아 API만 씁니다.</div>
          </div>
        </section>
      </main>
    </>
  );
}
