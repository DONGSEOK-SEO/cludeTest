// 수의계약 DB 테이블. 여러 번 실행해도 안전하다(IF NOT EXISTS).
import "server-only";
import { q } from "../db";

export async function ensureSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS contracts (
      id            BIGSERIAL PRIMARY KEY,
      source        TEXT NOT NULL,          -- g2b_api(조달청 계약정보 API) / andong_web(안동시 홈페이지)
      source_key    TEXT NOT NULL,          -- 출처별 고유키 (API: 계약번호, 안동: 계약대장관리번호)
      source_ord    INT  NOT NULL DEFAULT 0,-- API 계약차수 (변경계약이면 커짐, 최신 차수로 갱신)
      region        TEXT NOT NULL,          -- 서울/성남/수원/안동/문경
      sub_region    TEXT,                   -- 서울: 구 이름 또는 '서울시(본청·사업소)', 그 외: 구·읍면동·사업소
      org_name      TEXT,                   -- 계약기관
      org_code      TEXT,
      dept          TEXT,                   -- 담당부서 또는 관서명
      demand_org    TEXT,                   -- 수요기관
      title         TEXT NOT NULL,
      kind          TEXT,                   -- 공사/물품/용역
      method        TEXT,                   -- 수의계약, 수의1인견적, 수의2인이상견적 …
      private_reason TEXT,                  -- 수의계약 사유
      amount        BIGINT,
      contract_date DATE NOT NULL,
      period        TEXT,
      company       TEXT,
      bizno         TEXT,
      bid_no        TEXT,
      url           TEXT,
      dup_of        BIGINT,                 -- 다른 출처에 같은 계약이 있으면 그 행 id (화면·집계에서 제외)
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source, source_key)
    )`);
  await q(`CREATE INDEX IF NOT EXISTS contracts_region_date ON contracts (region, contract_date DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS contracts_date ON contracts (contract_date DESC)`);
  await q(`CREATE INDEX IF NOT EXISTS contracts_bizno ON contracts (bizno)`);
  await q(`
    CREATE TABLE IF NOT EXISTS collect_days (
      source     TEXT NOT NULL,
      day        DATE NOT NULL,
      status     TEXT NOT NULL,             -- done / error
      rows_found INT  NOT NULL DEFAULT 0,   -- 대상 지자체 수의계약 건수
      rows_new   INT  NOT NULL DEFAULT 0,
      calls      INT  NOT NULL DEFAULT 0,
      error      TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source, day)
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS collect_runs (
      id          BIGSERIAL PRIMARY KEY,
      kind        TEXT NOT NULL,            -- weekly / manual
      started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      ok          BOOLEAN,
      summary     JSONB
    )`);
}
