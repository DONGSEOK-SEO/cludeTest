// 입찰공고 한 구간(최대 7일): /api/bids?code=4817&from=20261118&to=20261124
import { NextResponse, type NextRequest } from "next/server";
import { getBidWindow } from "@/lib/server/bids";
import { fail, requireIndustry, requireWindow } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const code = await requireIndustry(p.get("code"));
    const { from, to } = requireWindow(p.get("from"), p.get("to"));
    return NextResponse.json(await getBidWindow(code, from, to));
  } catch (e) {
    return fail(e);
  }
}
