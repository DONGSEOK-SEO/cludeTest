// Postgres 연결 (운영: Vercel에 연결한 Neon, 로컬 시험: 로컬 Postgres)
// 연결 주소는 환경 변수에서만 읽는다: DATABASE_URL → POSTGRES_URL → POSTGRES_PRISMA_URL 순
import "server-only";
import { Pool, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL);
}

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("DB 연결 정보(DATABASE_URL)가 없습니다. Vercel Storage에서 Neon을 연결해 주세요.");
  // 로컬 시험 DB(localhost 또는 유닉스 소켓)만 SSL 없이 접속한다
  let local = false;
  try {
    const u = new URL(url);
    local = ["localhost", "127.0.0.1", ""].includes(u.hostname) || (u.searchParams.get("host") ?? "").startsWith("/");
  } catch {
    local = false;
  }
  pool = new Pool({
    connectionString: url,
    ssl: local ? undefined : { rejectUnauthorized: true },
    max: 3, // 서버리스 함수 하나당 연결을 적게 쓴다
    idleTimeoutMillis: 10_000,
  });
  return pool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const r = await getPool().query<T>(text, params);
  return r.rows;
}
