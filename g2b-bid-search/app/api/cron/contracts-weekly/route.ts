// 주 1회 예약 실행 1부: 최근 7일(조달청 API) + 최근 14일(안동 홈페이지)을 다시 받아 새 계약만 넣는다
// Vercel Cron이 Authorization: Bearer CRON_SECRET 을 보낸다. 2부(8~14일 전)는 /api/cron/contracts-weekly-2
import { NextResponse } from "next/server";
import { checkSecret, runRecent } from "@/lib/server/contracts/jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runRecent(0, 7, true, 240_000, "weekly-1");
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
