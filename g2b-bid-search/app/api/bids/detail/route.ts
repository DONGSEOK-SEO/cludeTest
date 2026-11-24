// 공고를 펼칠 때만 부르는 참가가능지역·면허 제한: /api/bids/detail?no=R26BK01843493&ord=000
import { NextResponse, type NextRequest } from "next/server";
import { getBidDetail } from "@/lib/server/bids";
import { fail, requireNotice } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const { no, ord } = requireNotice(p.get("no"), p.get("ord"));
    return NextResponse.json(await getBidDetail(no, ord));
  } catch (e) {
    return fail(e);
  }
}
