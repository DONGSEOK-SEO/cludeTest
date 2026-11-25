// 수의계약 DB 테이블 만들기 (관리용, Authorization: Bearer CRON_SECRET)
import { NextResponse } from "next/server";
import { checkSecret } from "@/lib/server/contracts/jobs";
import { ensureSchema } from "@/lib/server/contracts/schema";

export async function POST(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  return NextResponse.json({ ok: true });
}
