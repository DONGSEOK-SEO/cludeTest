// 낙찰 결과 한 구간(최대 7일, 개찰일 기준): /api/awards?code=4817&from=20261025&to=20261031
import { NextResponse, type NextRequest } from "next/server";
import { getAwardWindow } from "@/lib/server/awards";
import { fail, requireIndustry, requireWindow } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const code = await requireIndustry(p.get("code"));
    const { from, to } = requireWindow(p.get("from"), p.get("to"));
    return NextResponse.json(await getAwardWindow(code, from, to));
  } catch (e) {
    return fail(e);
  }
}
