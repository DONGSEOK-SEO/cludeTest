// 백필 진행 상황 (관리용, Authorization: Bearer CRON_SECRET)
import { NextResponse } from "next/server";
import { checkSecret, status } from "@/lib/server/contracts/jobs";

export async function GET(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await status());
}
