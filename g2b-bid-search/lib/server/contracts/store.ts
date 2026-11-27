// 계약 행을 DB에 넣는 공통 부분과 수집 기록
import "server-only";
import { q } from "../db";

export interface ContractRow {
  source: string;
  source_key: string;
  source_ord: number;
  region: string;
  sub_region: string | null;
  org_name: string | null;
  org_code: string | null;
  dept: string | null;
  demand_org: string | null;
  title: string;
  kind: string | null;
  method: string | null;
  private_reason: string | null;
  amount: number | null;
  contract_date: string; // YYYY-MM-DD
  period: string | null;
  company: string | null;
  bizno: string | null;
  bid_no: string | null;
  url: string | null;
}

const COLS: (keyof ContractRow)[] = [
  "source", "source_key", "source_ord", "region", "sub_region", "org_name", "org_code", "dept", "demand_org", "title", "kind",
  "method", "private_reason", "amount", "contract_date", "period", "company", "bizno", "bid_no", "url",
];

export function formatBizno(v: unknown) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : String(v ?? "").trim() || null;
}

/**
 * 여러 행을 한 번에 넣는다. 같은 (출처, 고유키)가 있으면:
 * - 새 차수(변경계약)가 같거나 크면 금액·이름 등을 최신으로 바꾸고, 계약일은 처음 값을 유지한다.
 * 반환: 새로 들어간 행 수
 */
export async function upsertContracts(input: ContractRow[]): Promise<number> {
  // 한 문장 안에 같은 키가 두 번 있으면 Postgres가 거부하므로, 키마다 최신 차수 하나만 남긴다
  const byKey = new Map<string, ContractRow>();
  for (const r of input) {
    const k = `${r.source}|${r.source_key}`;
    const cur = byKey.get(k);
    if (!cur || r.source_ord >= cur.source_ord) byKey.set(k, cur ? { ...r, contract_date: cur.contract_date } : r);
  }
  const rows = [...byKey.values()];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const values = chunk.map((r, j) => {
      COLS.forEach((c) => params.push(r[c]));
      return `(${COLS.map((_, k) => `$${j * COLS.length + k + 1}`).join(",")})`;
    });
    const res = await q<{ inserted: boolean }>(
      `INSERT INTO contracts (${COLS.join(",")}) VALUES ${values.join(",")}
       ON CONFLICT (source, source_key) DO UPDATE SET
         source_ord = EXCLUDED.source_ord, title = EXCLUDED.title, kind = EXCLUDED.kind, method = EXCLUDED.method,
         private_reason = COALESCE(EXCLUDED.private_reason, contracts.private_reason), amount = EXCLUDED.amount,
         period = EXCLUDED.period, company = EXCLUDED.company, bizno = EXCLUDED.bizno, dept = EXCLUDED.dept,
         sub_region = EXCLUDED.sub_region, org_name = EXCLUDED.org_name, demand_org = EXCLUDED.demand_org,
         bid_no = EXCLUDED.bid_no, url = EXCLUDED.url, fetched_at = now()
       WHERE EXCLUDED.source_ord >= contracts.source_ord
       RETURNING (xmax = 0) AS inserted`,
      params,
    );
    inserted += res.filter((r) => r.inserted).length;
  }
  return inserted;
}

export async function markDay(source: string, day: string, v: { status: string; found?: number; added?: number; calls?: number; error?: string }) {
  await q(
    `INSERT INTO collect_days (source, day, status, rows_found, rows_new, calls, error, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (source, day) DO UPDATE SET status=$3, rows_found=$4, rows_new=$5, calls=$6, error=$7, updated_at=now()`,
    [source, day, v.status, v.found ?? 0, v.added ?? 0, v.calls ?? 0, v.error ?? null],
  );
}

/** 여러 날짜의 수집 기록을 한 번에 남긴다 */
export async function markDays(source: string, entries: { day: string; found: number }[]) {
  if (!entries.length) return;
  await q(
    `INSERT INTO collect_days (source, day, status, rows_found, updated_at)
     SELECT $1, d::date, 'done', f, now() FROM unnest($2::text[], $3::int[]) AS t(d, f)
     ON CONFLICT (source, day) DO UPDATE SET status='done', rows_found=EXCLUDED.rows_found, error=NULL, updated_at=now()`,
    [source, entries.map((e) => e.day), entries.map((e) => e.found)],
  );
}

/**
 * 안동·성남은 시 홈페이지와 조달청 API 두 출처가 있다. 같은 계약의 API 행은 홈페이지 행의 중복으로 표시하고(dup_of),
 * API에만 있는 수의계약 사유·공고번호는 홈페이지 행에 옮겨 적는다.
 * - 같은 계약: 사업자번호·금액이 같고 계약일이 같거나(우선) 31일 안쪽인 것 중 가장 가까운 것
 *   (두 출처의 계약일이 며칠 어긋나는 경우가 있다. 2026년 10월 성남시에서 4건)
 */
export async function linkWebDuplicates(region: string, webSource: string, from: string, to: string) {
  await q(
    `UPDATE contracts g SET dup_of = m.wid
       FROM (
         SELECT DISTINCT ON (g.id) g.id AS gid, w.id AS wid
           FROM contracts g
           JOIN contracts w ON w.source = $2 AND w.region = $1 AND w.bizno = g.bizno AND w.amount = g.amount
                           AND abs(w.contract_date - g.contract_date) <= 31
          WHERE g.region = $1 AND g.source = 'g2b_api' AND g.bizno IS NOT NULL
            AND (g.contract_date BETWEEN $3::date AND $4::date OR w.contract_date BETWEEN $3::date AND $4::date)
          ORDER BY g.id, abs(w.contract_date - g.contract_date), w.id
       ) m
      WHERE g.id = m.gid AND g.dup_of IS DISTINCT FROM m.wid`,
    [region, webSource, from, to],
  );
  await q(
    `UPDATE contracts w SET private_reason = COALESCE(w.private_reason, g.private_reason), bid_no = COALESCE(w.bid_no, g.bid_no)
       FROM contracts g
      WHERE g.dup_of = w.id AND w.source = $1 AND (w.private_reason IS NULL OR w.bid_no IS NULL)
        AND (g.private_reason IS NOT NULL OR g.bid_no IS NOT NULL) AND w.contract_date BETWEEN $2::date - 31 AND $3::date + 31`,
    [webSource, from, to],
  );
}
