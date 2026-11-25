// 구글 시트 정리: 지자체별 최근 3개월 상세 + 2년치 업체별 집계를 매주 다시 쓴다.
// 구글 서비스 계정(프로그램용 계정)으로 Sheets API를 부른다. 필요한 환경 변수:
//   GOOGLE_SERVICE_ACCOUNT_JSON  서비스 계정 키(JSON 원문 또는 base64)
//   CONTRACTS_SHEET_ID           스프레드시트 ID (시트 주소의 /d/ 와 /edit 사이)
// 시트는 서비스 계정 이메일에 '편집자'로 공유해야 한다.
// 이 코드가 쓰는 탭(안내, ○○_최근3개월, 업체별_집계)만 지우고 다시 쓴다. 다른 탭은 건드리지 않는다.
import "server-only";
import { createSign } from "node:crypto";
import { REGIONS } from "../../contract-regions";
import { SOURCE_LABEL } from "../../contract-types";
import { addDays, dash, nowKst, todayKst } from "../../dates";
import { q } from "../db";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export function sheetConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.CONTRACTS_SHEET_ID);
}

function credentials(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "";
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const j = JSON.parse(text);
  if (!j.client_email || !j.private_key) throw new Error("서비스 계정 키에 client_email/private_key 가 없습니다");
  return { client_email: j.client_email, private_key: j.private_key };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  const { client_email, private_key } = credentials();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: client_email, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`구글 인증 실패: ${j.error_description ?? j.error ?? res.status}`);
  return j.access_token as string;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${SHEETS}/${process.env.CONTRACTS_SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`시트 API 오류(${res.status}): ${j.error?.message ?? ""}`.slice(0, 300));
  return j;
}

type Cell = string | number | null;

async function writeTab(token: string, existing: Map<string, number>, title: string, rows: Cell[][], widths: number[] = []) {
  // 탭이 없으면 만들고, 있으면 값만 지운다
  if (!existing.has(title)) {
    const r = await api(token, ":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
    existing.set(title, r.replies[0].addSheet.properties.sheetId);
  }
  const sheetId = existing.get(title)!;
  const range = encodeURIComponent(`'${title}'`);
  await api(token, `/values/${range}:clear`, { method: "POST", body: "{}" });
  // 행이 많으면 나눠 쓴다
  const cols = Math.max(...rows.map((r) => r.length));
  const needRows = rows.length + 10;
  await api(token, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: Math.max(needRows, 100), columnCount: Math.max(cols, 5), frozenRowCount: 1 } }, fields: "gridProperties(rowCount,columnCount,frozenRowCount)" } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.925, green: 0.94, blue: 1 } } }, fields: "userEnteredFormat(textFormat,backgroundColor)" } },
        ...widths.map((w, i) => ({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: "pixelSize" } })),
      ],
    }),
  });
  for (let i = 0; i < rows.length; i += 5000) {
    const part = rows.slice(i, i + 5000);
    await api(token, `/values/${encodeURIComponent(`'${title}'!A${i + 1}`)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: part }),
    });
  }
}

/** 시트를 다시 쓴다. 반환: 탭별 행 수 */
export async function syncSheet() {
  if (!sheetConfigured()) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON / CONTRACTS_SHEET_ID 환경 변수가 없습니다");
  const token = await accessToken();
  const meta = await api(token, "?fields=sheets.properties(sheetId,title)");
  const existing = new Map<string, number>(meta.sheets.map((s: { properties: { title: string; sheetId: number } }) => [s.properties.title, s.properties.sheetId]));

  const today = todayKst();
  const from3m = dash(addDays(today, -90));
  const from2y = dash(addDays(today, -729));
  const result: Record<string, number> = {};

  for (const r of REGIONS) {
    const rows = await q<Record<string, string | null>>(
      `SELECT to_char(contract_date,'YYYY-MM-DD') AS d, sub_region, dept, title, kind, method, private_reason, amount, period, company, bizno, source, url
         FROM contracts WHERE dup_of IS NULL AND region = $1 AND contract_date >= $2 ORDER BY contract_date DESC, id DESC`,
      [r.key, from3m],
    );
    const values: Cell[][] = [
      ["계약일", "기관(구·읍면동·사업소)", "부서", "계약명", "구분", "계약방법", "수의계약 사유", "계약금액(원)", "계약기간", "업체명", "사업자번호", "출처", "원문 링크"],
      ...rows.map((x) => [x.d, x.sub_region, x.dept, x.title, x.kind, x.method, x.private_reason, x.amount == null ? null : Number(x.amount), x.period, x.company, x.bizno, SOURCE_LABEL[x.source ?? ""] ?? x.source, x.url]),
    ];
    const title = `${r.key}_최근3개월`;
    await writeTab(token, existing, title, values, [90, 150, 150, 380, 50, 110, 260, 110, 170, 200, 110, 140, 200]);
    result[title] = rows.length;
  }

  const comp = await q<Record<string, string | null>>(
    `SELECT max(company) AS company, bizno, string_agg(DISTINCT region, ', ') AS regions, count(*) AS n, coalesce(sum(amount),0) AS total,
            count(*) FILTER (WHERE kind='용역') AS n_service, to_char(max(contract_date),'YYYY-MM-DD') AS last
       FROM contracts WHERE dup_of IS NULL AND contract_date >= $1
      GROUP BY bizno, CASE WHEN bizno IS NULL THEN company END ORDER BY count(*) DESC, sum(amount) DESC NULLS LAST`,
    [from2y],
  );
  await writeTab(
    token,
    existing,
    "업체별_집계",
    [
      ["업체명", "사업자번호", "지자체", "수의계약 건수", "계약금액 합계(원)", "그중 용역 건수", "최근 계약일"],
      ...comp.map((c) => [c.company, c.bizno, c.regions, Number(c.n), Number(c.total), Number(c.n_service), c.last]),
    ],
    [220, 110, 160, 100, 140, 100, 100],
  );
  result["업체별_집계"] = comp.length;

  const counts = await q<{ region: string; n: string; first: string; last: string }>(
    `SELECT region, count(*) AS n, to_char(min(contract_date),'YYYY-MM-DD') AS first, to_char(max(contract_date),'YYYY-MM-DD') AS last
       FROM contracts WHERE dup_of IS NULL AND contract_date >= $1 GROUP BY region ORDER BY count(*) DESC`,
    [from2y],
  );
  await writeTab(
    token,
    existing,
    "안내",
    [
      ["항목", "내용"],
      ["갱신 시각", `${nowKst()} (매주 월요일 자동 갱신)`],
      ["대상", "서울(본청·사업소·25개 구), 경기 성남·수원, 경북 안동·문경의 수의계약"],
      ["상세 탭", `지자체별 최근 3개월 (${from3m} ~ ${dash(today)})`],
      ["업체별_집계", `최근 2년 (${from2y} ~ ${dash(today)}), 사업자번호 기준`],
      ["출처", "조달청 공공데이터개방표준서비스 계약정보 API(나라장터를 거친 계약), 안동시 홈페이지 수의계약 현황"],
      ["주의", "조달청 API에는 소액 1인 견적 수의계약이 빠질 수 있음. 안동시는 두 출처를 합치고 같은 계약은 한 번만 셈. 연락처는 저장하지 않음"],
      ["편집", "이 탭과 '○○_최근3개월', '업체별_집계' 탭은 매주 지우고 다시 씁니다. 메모는 다른 탭에 적어 주세요"],
      ["전체 조회", "https://buildtalkweb1.vercel.app/contracts"],
      [],
      ["지자체", "2년 건수"],
      ...counts.map((c) => [c.region, Number(c.n)]),
    ],
    [140, 700],
  );
  return { ok: true, tabs: result, at: nowKst() };
}
