// 지자체 수의계약 조회 (DB에서 읽음): /api/contracts?region=서울&sub=강남구&from=2026-08-01&to=2026-11-25&kind=용역&q=설계&company=건축사&page=1
// export=1 이면 엑셀용으로 최대 2만 건을 돌려준다.
import { NextResponse, type NextRequest } from "next/server";
import { dbConfigured } from "@/lib/server/db";
import { exportContracts, listContracts, parseQuery } from "@/lib/server/contracts/query";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!dbConfigured()) {
    return NextResponse.json({ error: { kind: "api", message: "DB가 연결되지 않았습니다(DATABASE_URL 없음)." } }, { status: 503 });
  }
  const p = request.nextUrl.searchParams;
  const f = parseQuery(p);
  try {
    if (p.get("export") === "1") return NextResponse.json(await exportContracts(f));
    return NextResponse.json(await listContracts(f));
  } catch (e) {
    const msg = (e as Error).message;
    console.error("수의계약 조회 실패:", msg);
    const notReady = /relation .* does not exist/.test(msg);
    return NextResponse.json(
      { error: { kind: "api", message: notReady ? "수의계약 DB가 아직 만들어지지 않았습니다(수집 전)." : "수의계약을 조회하지 못했습니다." } },
      { status: 500 },
    );
  }
}
