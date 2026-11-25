"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    const body = await res?.json().catch(() => null);
    setError(body?.error?.message ?? "로그인하지 못했습니다.");
  }

  return (
    <main className="wrap">
      <section className="panel login">
        <span className="logo">빌드톡</span>
        <h1>나라장터 입찰·낙찰 조회</h1>
        <p className="small muted">빌드톡 사내용입니다. 공유받은 비밀번호를 입력해 주세요.</p>
        <form onSubmit={submit}>
          <label className="small" htmlFor="pw">
            비밀번호
          </label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <div className="notice error" style={{ margin: 0 }}>{error}</div>}
          <button type="submit" className="btn primary" disabled={busy || !password}>
            {busy ? "확인 중…" : "들어가기"}
          </button>
        </form>
      </section>
    </main>
  );
}
