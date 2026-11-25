// 수의계약 조회 (DB에서만 읽음, 외부 API 호출 없음)
import "server-only";
import { REGIONS } from "../../contract-regions";
import type { ContractListResult, ContractQuery } from "../../contract-types";
import { q } from "../db";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const EXPORT_LIMIT = 20000;

export function parseQuery(p: URLSearchParams): ContractQuery {
  const s = (k: string) => (p.get(k) ?? "").trim();
  const n = (k: string) => {
    const v = Number(s(k).replace(/,/g, ""));
    return s(k) && Number.isFinite(v) ? v : null;
  };
  return {
    region: REGIONS.some((r) => r.key === s("region")) ? s("region") : "",
    sub: s("sub").slice(0, 40),
    from: ISO.test(s("from")) ? s("from") : "",
    to: ISO.test(s("to")) ? s("to") : "",
    kind: ["공사", "물품", "용역"].includes(s("kind")) ? s("kind") : "",
    method: s("method").slice(0, 40),
    q: s("q").slice(0, 100),
    company: s("company").slice(0, 100),
    min: n("min"),
    max: n("max"),
    page: Math.max(1, Math.floor(n("page") ?? 1)),
    sort: s("sort") === "amount" ? "amount" : "date",
  };
}

function where(f: ContractQuery) {
  const cond = ["dup_of IS NULL"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    cond.push(sql.replace("?", `$${params.length}`));
  };
  if (f.region) add("region = ?", f.region);
  if (f.sub) add("sub_region = ?", f.sub);
  if (f.from) add("contract_date >= ?", f.from);
  if (f.to) add("contract_date <= ?", f.to);
  if (f.kind) add("kind = ?", f.kind);
  if (f.method) add("method = ?", f.method);
  if (f.q) add("title ILIKE ?", `%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
  if (f.company) {
    const digits = f.company.replace(/\D/g, "");
    if (digits.length === 10) add("replace(bizno, '-', '') = ?", digits);
    else add("company ILIKE ?", `%${f.company.replace(/[%_\\]/g, "\\$&")}%`);
  }
  if (f.min != null) add("amount >= ?", f.min);
  if (f.max != null) add("amount <= ?", f.max);
  return { sql: cond.join(" AND "), params };
}

const COLS = `id, source, region, sub_region, org_name, dept, demand_org, title, kind, method, private_reason, amount,
  to_char(contract_date, 'YYYY-MM-DD') AS contract_date, period, company, bizno, bid_no, url`;

export async function listContracts(f: ContractQuery, size = 100): Promise<ContractListResult> {
  const w = where(f);
  const order = f.sort === "amount" ? "amount DESC NULLS LAST, contract_date DESC" : "contract_date DESC, id DESC";
  const [rows, [sum], companies, methods, sources] = await Promise.all([
    q(`SELECT ${COLS} FROM contracts WHERE ${w.sql} ORDER BY ${order} LIMIT ${size} OFFSET ${(f.page - 1) * size}`, w.params),
    q<{ n: string; total: string | null; companies: string }>(
      `SELECT count(*) AS n, sum(amount) AS total, count(DISTINCT coalesce(bizno, company)) AS companies FROM contracts WHERE ${w.sql}`,
      w.params,
    ),
    q(
      `SELECT bizno, max(company) AS company, count(*)::int AS n, coalesce(sum(amount), 0)::bigint AS total
         FROM contracts WHERE ${w.sql} GROUP BY bizno, CASE WHEN bizno IS NULL THEN company END
         ORDER BY n DESC, total DESC LIMIT 100`,
      w.params,
    ),
    q<{ method: string }>(`SELECT DISTINCT method FROM contracts WHERE method IS NOT NULL ORDER BY method`),
    q<{ source: string; last_day: string | null; last_update: string | null }>(
      `SELECT source, to_char(max(day) FILTER (WHERE status='done'), 'YYYY-MM-DD') AS last_day,
              to_char(max(updated_at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS last_update
         FROM collect_days GROUP BY source`,
    ),
  ]);
  const n = Number(sum?.n ?? 0);
  const total = Number(sum?.total ?? 0);
  return {
    rows: rows as ContractListResult["rows"],
    total: n,
    sum: total,
    avg: n ? Math.round(total / n) : 0,
    companyCount: Number(sum?.companies ?? 0),
    page: f.page,
    size,
    companies: companies.map((c) => ({ bizno: c.bizno, company: c.company, n: Number(c.n), total: Number(c.total) })),
    methods: methods.map((m) => m.method),
    sources,
  };
}

export async function exportContracts(f: ContractQuery) {
  const w = where(f);
  const rows = await q(`SELECT ${COLS} FROM contracts WHERE ${w.sql} ORDER BY contract_date DESC, id DESC LIMIT ${EXPORT_LIMIT + 1}`, w.params);
  return { rows: rows.slice(0, EXPORT_LIMIT), truncated: rows.length > EXPORT_LIMIT, limit: EXPORT_LIMIT };
}
