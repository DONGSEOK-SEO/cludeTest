"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Favorites, Industry, IndustryList, Usage } from "@/lib/types";
import AwardsTab from "./AwardsTab";
import BidsTab from "./BidsTab";
import { errorText, getJson } from "./format";
import IndustryPicker from "./IndustryPicker";

type Tab = "bids" | "awards";

function readUrl(): { code: string; tab: Tab } {
  const p = new URLSearchParams(window.location.search);
  return { code: p.get("code") ?? "", tab: p.get("tab") === "awards" ? "awards" : "bids" };
}

export default function App({ authEnabled }: { authEnabled: boolean }) {
  const [list, setList] = useState<IndustryList | null>(null);
  const [listError, setListError] = useState("");
  const [code, setCode] = useState("");
  const [tab, setTab] = useState<Tab>("bids");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [favorites, setFavorites] = useState<Favorites>({ codes: [], persistent: true });
  const router = useRouter();

  useEffect(() => {
    getJson<Favorites>("/api/favorites").then(setFavorites, () => {});
  }, []);

  /** 자주 쓰는 업종 추가·삭제. 모든 사용자가 같은 목록을 본다 */
  const toggleFavorite = useCallback(async (code: string, add: boolean) => {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: add ? "add" : "remove", code }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!res?.ok) {
      if (res?.status === 401) window.dispatchEvent(new Event("g2b:auth-required"));
      throw new Error(body?.error?.message ?? "자주 쓰는 업종을 바꾸지 못했습니다.");
    }
    setFavorites(body as Favorites);
  }, []);

  useEffect(() => {
    const toLogin = () => router.push("/login");
    window.addEventListener("g2b:auth-required", toLogin);
    return () => window.removeEventListener("g2b:auth-required", toLogin);
  }, [router]);

  const refreshUsage = useCallback(() => {
    getJson<Usage>("/api/usage").then(setUsage, () => {});
  }, []);

  useEffect(() => {
    // 주소의 ?code=&tab= 을 읽어 공유한 링크로 바로 열리게 한다
    const u = readUrl();
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab(u.tab);
    if (u.code) setCode(u.code);
    /* eslint-enable react-hooks/set-state-in-effect */
    getJson<IndustryList & { refreshError?: string }>("/api/industries")
      .then((l) => {
        setList(l);
        if (l.refreshError)
          setListError(`업종 API 갱신에 실패해 저장된 목록을 씁니다 (${l.source === "seed" ? "초기 데이터" : l.updatedAt}).`);
      })
      .catch((e) => setListError(`업종 목록을 불러오지 못했습니다. ${errorText(e)}`))
      .finally(refreshUsage);
  }, [refreshUsage]);

  const industry: Industry | null = useMemo(() => list?.items.find((i) => i.cd === code) ?? null, [list, code]);
  const badCode = Boolean(list && code && !industry);

  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    if (tab === "awards") p.set("tab", "awards");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [code, tab]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  const used = usage ? Math.max(usage.calls.bid, usage.calls.award, usage.calls.industry) : 0;

  return (
    <>
      <header className="brandbar">
        <div className="brandbar-inner">
          <div className="brand">
            <span className="logo">빌드톡</span>
            <span className="brand-divider" aria-hidden="true" />
            <h1>나라장터 입찰·낙찰 조회</h1>
          </div>
          <div className="usage" title="이 사이트가 오늘(한국시간) 부른 횟수. 개발계정은 API마다 하루 1,000회까지입니다.">
            <span>오늘 API 호출</span>
            {usage ? (
              <>
                <span className={usage.calls.bid > usage.limit * 0.8 ? "high" : ""}>
                  입찰 <b>{usage.calls.bid}</b>
                </span>
                <span className={usage.calls.award > usage.limit * 0.8 ? "high" : ""}>
                  낙찰 <b>{usage.calls.award}</b>
                </span>
                <span>
                  업종 <b>{usage.calls.industry}</b>
                </span>
                <span>/ 각 {usage.limit.toLocaleString()}회</span>
              </>
            ) : (
              <span>-</span>
            )}
            {authEnabled && (
              <button type="button" className="btn chip" onClick={logout}>
                로그아웃
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="wrap">
        <p className="intro">업종을 고르면 진행 중인 용역 입찰공고와 지난 낙찰 결과를 보여 줍니다. 빌드톡 사내용입니다.</p>
        {used > (usage?.limit ?? 1000) * 0.8 && (
          <div className="notice warn">오늘 호출 한도의 80%를 넘었습니다. 긴 기간 조회는 내일로 미루는 것이 좋습니다.</div>
        )}

        <IndustryPicker
          list={list}
          listError={listError}
          selected={industry}
          favorites={favorites.codes}
          favoritesPersistent={favorites.persistent}
          onToggleFavorite={toggleFavorite}
          onSelect={(i) => setCode(i.cd)}
        />

        {badCode && <div className="notice error">업종 목록에 없는 업종코드입니다: {code}. 목록에서 다시 골라 주세요.</div>}

        {industry ? (
          <section className="panel">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "bids"} onClick={() => setTab("bids")}>
                진행 중 공고
              </button>
              <button type="button" role="tab" aria-selected={tab === "awards"} onClick={() => setTab("awards")}>
                낙찰 결과
              </button>
            </div>
            {tab === "bids" ? (
              <BidsTab key={`b-${industry.cd}`} industry={industry} onUsage={refreshUsage} />
            ) : (
              <AwardsTab key={`a-${industry.cd}`} industry={industry} onUsage={refreshUsage} />
            )}
          </section>
        ) : (
          !badCode && (
            <section className="panel empty">
              위에서 업종을 골라 주세요. 업종명(예: 건축사)이나 업종코드(예: 4817)로 검색할 수 있습니다.
            </section>
          )
        )}
      </main>
    </>
  );
}
