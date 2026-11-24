// 비밀번호 사용 여부(SITE_PASSWORD)를 요청 때마다 읽도록 매번 그린다
export const dynamic = "force-dynamic";

import App from "@/components/App";
import { FAVORITE_CODES } from "@/config/favorites";
import { authEnabled } from "@/lib/auth";

export default function Home() {
  return <App favorites={FAVORITE_CODES} authEnabled={authEnabled()} />;
}
