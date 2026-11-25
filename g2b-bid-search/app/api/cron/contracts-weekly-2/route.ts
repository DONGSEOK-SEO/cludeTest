// 주 1회 예약 실행 2부: 8~14일 전 수의계약을 다시 받고, 끝나면 구글 시트를 다시 쓴다 (1부는 /api/cron/contracts-weekly)
import { NextResponse } from "next/server";
import { checkSecret, runRecent } from "@/lib/server/contracts/jobs";
import { sheetConfigured, syncSheet } from "@/lib/server/contracts/sheet";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const result: Record<string, unknown> = await runRecent(7, 7, false, 170_000, "weekly-2");
  // 시트 쓰기에는 1분 안팎이 걸린다. 남은 시간이 모자라면 건너뛰고 기록만 남긴다
  if (sheetConfigured()) {
    if (Date.now() - started < 200_000) {
      try {
        result.sheet = await syncSheet();
      } catch (e) {
        result.sheet = { error: (e as Error).message };
      }
    } else {
      result.sheet = { skipped: "시간 부족, 관리용 주소로 따로 실행 필요" };
    }
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
