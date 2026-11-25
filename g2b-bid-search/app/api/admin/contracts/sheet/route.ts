// 구글 시트 다시 쓰기 (관리용, Authorization: Bearer CRON_SECRET)
import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/server/contracts/jobs";
import { syncSheet } from "@/lib/server/contracts/sheet";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncSheet());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
