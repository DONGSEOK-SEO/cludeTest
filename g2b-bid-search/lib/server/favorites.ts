// 자주 쓰는 업종: 사이트를 쓰는 사람 모두가 같은 목록을 본다(서버 저장소에 보관).
// 처음에는 config/favorites.ts 의 기본값을 쓰고, 화면에서 추가·삭제하면 저장소에 기록한다.
import "server-only";
import { FAVORITE_CODES } from "@/config/favorites";
import type { Favorites } from "../types";
import { G2BError } from "./g2b";
import { findIndustry } from "./industries";
import { getStore } from "./store";

const KEY = "favorites";
const MAX = 20;
const TEN_YEARS = 10 * 365 * 24 * 3600;

/** Redis가 연결돼 있거나 로컬(파일 저장)이면 유지된다. Redis 없는 Vercel은 서버가 바뀌면 사라진다 */
function persistent() {
  return getStore().kind === "redis" || !process.env.VERCEL;
}

export async function getFavorites(): Promise<Favorites> {
  let codes: string[] | null = null;
  try {
    codes = await getStore().get<string[]>(KEY);
  } catch (e) {
    console.warn("자주 쓰는 업종 읽기 실패:", (e as Error).message);
  }
  return { codes: codes ?? FAVORITE_CODES, persistent: persistent() };
}

/** 추가·삭제를 서버에서 처리해, 두 사람이 동시에 바꿔도 서로의 변경을 덮어쓰지 않게 한다 */
export async function changeFavorite(action: "add" | "remove", code: string): Promise<Favorites> {
  if (!/^\d{4}$/.test(code)) throw new G2BError("input", "업종코드가 잘못됐습니다.", 400);
  const { codes } = await getFavorites();
  let next = codes;
  if (action === "add") {
    if (!(await findIndustry(code))) throw new G2BError("input", `업종 목록에 없는 코드입니다: ${code}`, 400);
    if (!codes.includes(code)) {
      if (codes.length >= MAX) throw new G2BError("input", `자주 쓰는 업종은 ${MAX}개까지 등록할 수 있습니다.`, 400);
      next = [...codes, code];
    }
  } else {
    next = codes.filter((c) => c !== code);
  }
  try {
    await getStore().set(KEY, next, TEN_YEARS);
  } catch (e) {
    console.warn("자주 쓰는 업종 저장 실패:", (e as Error).message);
    throw new G2BError("api", "자주 쓰는 업종을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
  return { codes: next, persistent: persistent() };
}
