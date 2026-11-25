// 주 1회 예약 실행 2부: 8~14일 전 수의계약을 다시 받는다 (1부는 /api/cron/contracts-weekly)
import { NextResponse } from "next/server";
import { checkSecret, runRecent } from "@/lib/server/contracts/jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runRecent(7, 7, false, 270_000, "weekly-2");
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
