// 자주 쓰는 업종 목록 조회(GET), 추가·삭제(POST {action: "add" | "remove", code})
import { NextResponse, type NextRequest } from "next/server";
import { changeFavorite, getFavorites } from "@/lib/server/favorites";
import { fail } from "@/lib/server/http";

export async function GET() {
  return NextResponse.json(await getFavorites());
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string };
    const action = body.action === "remove" ? "remove" : body.action === "add" ? "add" : null;
    if (!action) return NextResponse.json({ error: { kind: "input", message: "action 은 add 또는 remove 입니다." } }, { status: 400 });
    return NextResponse.json(await changeFavorite(action, String(body.code ?? "")));
  } catch (e) {
    return fail(e);
  }
}
