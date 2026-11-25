// 수의계약 수집 (관리용, Authorization: Bearer CRON_SECRET). 2년 백필을 하루·한 달 단위로 나눠 부를 때 쓴다.
// 본문: {"source":"g2b","day":"YYYYMMDD"} 또는 {"source":"andong","from":"YYYYMMDD","to":"YYYYMMDD"}
import { NextResponse } from "next/server";
import { isYmd } from "@/lib/dates";
import { collectAndong } from "@/lib/server/contracts/andong";
import { collectG2bDay } from "@/lib/server/contracts/g2b";
import { checkSecret } from "@/lib/server/contracts/jobs";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!checkSecret(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { source?: string; day?: string; from?: string; to?: string };
  try {
    if (b.source === "g2b" && isYmd(b.day)) return NextResponse.json(await collectG2bDay(b.day));
    if (b.source === "andong" && isYmd(b.from) && isYmd(b.to) && b.from <= b.to) {
      return NextResponse.json(await collectAndong(b.from, b.to));
    }
    return NextResponse.json({ error: "source/day 또는 source/from/to 가 잘못됐습니다" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
