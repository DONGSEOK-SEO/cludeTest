import "server-only";
import { NextResponse } from "next/server";
import { dateCount, isYmd } from "../dates";
import type { ApiErrorBody } from "../types";
import { G2BError } from "./g2b";
import { findIndustry } from "./industries";

export function fail(e: unknown) {
  if (e instanceof G2BError) {
    return NextResponse.json<ApiErrorBody>({ error: { kind: e.kind, message: e.message } }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json<ApiErrorBody>(
    { error: { kind: "api", message: "서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } },
    { status: 500 },
  );
}

/** 업종코드는 업종 목록에 있는 것만 받는다(자유 입력값으로 조회하지 않음) */
export async function requireIndustry(code: string | null) {
  if (!code || !/^\d{4}$/.test(code)) throw new G2BError("input", "업종을 목록에서 선택해 주세요.", 400);
  if (!(await findIndustry(code))) throw new G2BError("input", `업종 목록에 없는 코드입니다: ${code}`, 400);
  return code;
}

/** 조회 구간은 날짜 경계로 자른 최대 7일 */
export function requireWindow(from: string | null, to: string | null) {
  if (!isYmd(from) || !isYmd(to) || from > to) throw new G2BError("input", "조회 기간이 잘못됐습니다.", 400);
  if (dateCount(from, to) > 7) throw new G2BError("range", "한 번에 조회할 수 있는 기간은 7일입니다.", 400);
  return { from, to };
}

export function requireNotice(no: string | null, ord: string | null) {
  if (!no || !/^[A-Z0-9]{6,20}$/.test(no) || !ord || !/^\d{1,3}$/.test(ord)) {
    throw new G2BError("input", "공고번호가 잘못됐습니다.", 400);
  }
  return { no, ord };
}
