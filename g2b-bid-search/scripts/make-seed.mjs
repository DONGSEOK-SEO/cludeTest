// 업종 전체 목록(API 원본 JSON)을 사이트 초기 데이터 형식으로 줄여 data/industries-seed.json 에 저장
// 사용법: node scripts/make-seed.mjs <업종 API 원본 JSON 경로> [수집일 YYYY-MM-DD]
import { readFileSync, writeFileSync } from "node:fs";

const [src, date] = process.argv.slice(2);
if (!src) {
  console.error("사용법: node scripts/make-seed.mjs <원본 JSON> [수집일]");
  process.exit(1);
}
const raw = JSON.parse(readFileSync(src, "utf8"));
const items = raw
  .filter((r) => (r.indstrytyUseYn || "Y") === "Y")
  .map((r) => ({
    cd: r.indstrytyCd,
    nm: (r.indstrytyNm || "").trim(),
    cc: r.indstrytyClsfcCd || "",
    cn: (r.indstrytyClsfcNm || "").trim(),
    law: [r.baseLawordNm, r.baseLawordArtclClauseNm].filter(Boolean).join(" ").trim(),
    url: r.baseLawordUrl || "",
    incl: r.inclsnLcns || "",
  }))
  .sort((a, b) => a.cd.localeCompare(b.cd));
writeFileSync(
  new URL("../data/industries-seed.json", import.meta.url),
  JSON.stringify({ updatedAt: date ? `${date} 00:00` : null, items }) + "\n",
);
console.log(`저장: ${items.length}개`);
