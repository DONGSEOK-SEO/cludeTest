// 업종 목록. ?refresh=1 이면 24시간이 안 지났어도 업종 API에서 다시 받는다.
import { NextResponse, type NextRequest } from "next/server";
import { getIndustries } from "@/lib/server/industries";
import { fail } from "@/lib/server/http";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await getIndustries(force));
  } catch (e) {
    return fail(e);
  }
}
