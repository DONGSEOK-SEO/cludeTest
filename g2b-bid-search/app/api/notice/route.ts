// 낙찰 행을 펼칠 때 공고 정보(공고기관·계약방법·추정가격): /api/notice?no=...&ord=...
import { NextResponse, type NextRequest } from "next/server";
import { getNoticeInfo } from "@/lib/server/bids";
import { fail, requireNotice } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const { no, ord } = requireNotice(p.get("no"), p.get("ord"));
    return NextResponse.json({ notice: await getNoticeInfo(no, ord) });
  } catch (e) {
    return fail(e);
  }
}
