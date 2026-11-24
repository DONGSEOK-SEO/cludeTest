// API 응답 저장소(캐시)와 호출 수 카운터.
// - Vercel 배포: Upstash Redis(Vercel 마켓플레이스 무료)를 연결하면 그걸 쓴다. 인스턴스가 바뀌어도 캐시가 유지됨.
// - 로컬 개발: 프로젝트의 .cache 폴더에 파일로 저장.
// - Redis 없이 Vercel에 배포하면 /tmp 에 저장되는데, 서버 인스턴스가 바뀌면 사라진다(동작은 하지만 호출 수가 늘어남).
import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface Store {
  readonly kind: "redis" | "file";
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  getNumbers(keys: string[]): Promise<number[]>;
}

const PREFIX = "g2b:v1:";

function redisStore(url: string, token: string): Store {
  async function cmd(body: unknown, pipeline = false) {
    const res = await fetch(pipeline ? `${url}/pipeline` : url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis 오류 ${res.status}`);
    return res.json();
  }
  return {
    kind: "redis",
    async get<T>(key: string) {
      const r = await cmd(["GET", PREFIX + key]);
      return r.result == null ? null : (JSON.parse(r.result) as T);
    },
    async set(key, value, ttlSec) {
      await cmd(["SET", PREFIX + key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSec))]);
    },
    async incr(key, ttlSec) {
      const r = await cmd([["INCR", PREFIX + key], ["EXPIRE", PREFIX + key, ttlSec]], true);
      return Number(r[0]?.result ?? 0);
    },
    async getNumbers(keys) {
      if (!keys.length) return [];
      const r = await cmd(["MGET", ...keys.map((k) => PREFIX + k)]);
      return (r.result as (string | null)[]).map((v) => Number(v ?? 0));
    },
  };
}

function fileStore(dir: string): Store {
  const file = (key: string) => path.join(dir, createHash("sha1").update(key).digest("hex") + ".json");
  async function read(key: string): Promise<{ exp: number; v: unknown } | null> {
    try {
      const e = JSON.parse(await readFile(file(key), "utf8"));
      return e.exp > Date.now() ? e : null;
    } catch {
      return null;
    }
  }
  async function write(key: string, v: unknown, ttlSec: number) {
    await mkdir(dir, { recursive: true });
    await writeFile(file(key), JSON.stringify({ exp: Date.now() + ttlSec * 1000, key, v }));
  }
  return {
    kind: "file",
    async get<T>(key: string) {
      return ((await read(key))?.v as T) ?? null;
    },
    set: write,
    async incr(key, ttlSec) {
      const n = Number((await read(key))?.v ?? 0) + 1;
      await write(key, n, ttlSec);
      return n;
    },
    async getNumbers(keys) {
      return Promise.all(keys.map(async (k) => Number((await read(k))?.v ?? 0)));
    },
  };
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) store = redisStore(url.replace(/\/$/, ""), token);
  else store = fileStore(process.env.CACHE_DIR || (process.env.VERCEL ? "/tmp/g2b-cache" : path.join(process.cwd(), ".cache")));
  return store;
}

/** 저장소 오류가 나도 조회는 계속되게, 캐시 읽기·쓰기 실패는 무시한다 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await getStore().get<T>(key);
  } catch (e) {
    console.warn("캐시 읽기 실패:", (e as Error).message);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number) {
  try {
    await getStore().set(key, value, ttlSec);
  } catch (e) {
    console.warn("캐시 쓰기 실패:", (e as Error).message);
  }
}
