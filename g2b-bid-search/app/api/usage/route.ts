// 오늘(한국시간) 이 사이트가 쓴 API별 호출 수
import { NextResponse } from "next/server";
import { getUsage } from "@/lib/server/g2b";

export async function GET() {
  return NextResponse.json(await getUsage());
}
