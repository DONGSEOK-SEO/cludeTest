// 수집 작업: 관리용 주소(백필)와 주 1회 예약 실행이 같이 쓴다
import "server-only";
import { addDays, todayKst } from "../../dates";
import { q } from "../db";
import { collectAndong } from "./andong";
import { collectG2bDay, G2B_SOURCE } from "./g2b";
import { ensureSchema } from "./schema";

/** 예약 실행 주소와 관리용 주소는 비밀값(CRON_SECRET)으로만 연다. Vercel 예약 실행은 이 값을 Bearer 로 보낸다 */
export function checkSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = request.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

/**
 * 최근 날짜 갱신: 오늘에서 skip 일 전부터 days 일을 조달청 API로 하루씩(최근 날짜부터) 받는다.
 * withAndong 이면 안동 홈페이지 최근 14일도 한 번에 받는다.
 * 조달청 API가 느려서(하루 약 20~70초) 주간 작업을 1주씩 두 번으로 나눠 부른다.
 * 실행 시간 제한을 넘지 않게 budgetMs 가 지나면 남은 날짜는 건너뛰고 기록한다.
 */
export async function runRecent(skip = 0, days = 7, withAndong = true, budgetMs = 240_000, kind = "weekly") {
  const started = Date.now();
  await ensureSchema();
  const [run] = await q<{ id: string }>(`INSERT INTO collect_runs (kind) VALUES ($1) RETURNING id`, [kind]);
  const today = todayKst();
  const to = addDays(today, -skip);
  const from = addDays(to, -(days - 1));
  const summary: Record<string, unknown> = { from, to };
  let ok = true;
  if (withAndong) {
    try {
      summary.andong = await collectAndong(addDays(today, -13), today);
    } catch (e) {
      ok = false;
      summary.andong = { error: (e as Error).message };
    }
  }
  // 날짜 두 개씩 동시에 받는다(조달청 API 응답이 느림)
  const g2b: unknown[] = [];
  const skipped: string[] = [];
  const queue = Array.from({ length: days }, (_, i) => addDays(to, -i));
  async function worker() {
    for (let day = queue.shift(); day; day = queue.shift()) {
      if (Date.now() - started > budgetMs) {
        skipped.push(day);
        continue;
      }
      try {
        g2b.push(await collectG2bDay(day));
      } catch (e) {
        ok = false;
        g2b.push({ day, error: (e as Error).message });
      }
    }
  }
  await Promise.all([worker(), worker()]);
  summary.g2b = g2b;
  if (skipped.length) {
    ok = false;
    summary.g2bSkipped = skipped;
  }
  await q(`UPDATE collect_runs SET finished_at = now(), ok = $2, summary = $3 WHERE id = $1`, [run.id, ok, JSON.stringify(summary)]);
  return { ok, ...summary };
}

/** 백필 진행 상황: 최근 2년(730일) 중 수집한 날짜 수와 지자체별 건수 */
export async function status() {
  await ensureSchema();
  const today = todayKst();
  const from = addDays(today, -729);
  const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const days = await q<{ source: string; done: string; errors: string; last: string | null }>(
    `SELECT source, count(*) FILTER (WHERE status='done') AS done, count(*) FILTER (WHERE status='error') AS errors,
            max(updated_at)::text AS last
       FROM collect_days WHERE day BETWEEN $1 AND $2 GROUP BY source`,
    [iso(from), iso(today)],
  );
  const missingG2b = await q<{ day: string }>(
    `SELECT to_char(d, 'YYYYMMDD') AS day FROM generate_series($1::date, $2::date, interval '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM collect_days c WHERE c.source = $3 AND c.day = d::date AND c.status = 'done')
      ORDER BY d DESC`,
    [iso(from), iso(today), G2B_SOURCE],
  );
  const regions = await q<{ region: string; source: string; n: string; min: string; max: string }>(
    `SELECT region, source, count(*) AS n, min(contract_date)::text AS min, max(contract_date)::text AS max
       FROM contracts WHERE dup_of IS NULL GROUP BY region, source ORDER BY region, source`,
  );
  const runs = await q(`SELECT id, kind, started_at, finished_at, ok FROM collect_runs ORDER BY id DESC LIMIT 5`);
  return { range: { from, to: today, days: 730 }, days, g2bMissing: missingG2b.map((r) => r.day), regions, runs };
}
