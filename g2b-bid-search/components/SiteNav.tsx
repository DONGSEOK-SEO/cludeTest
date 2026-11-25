// 상단 메뉴: 입찰·낙찰 조회 / 지자체 수의계약
import Link from "next/link";

export default function SiteNav({ active }: { active: "bids" | "contracts" }) {
  return (
    <nav className="site-nav" aria-label="메뉴">
      <Link href="/" aria-current={active === "bids" ? "page" : undefined}>
        입찰·낙찰 조회
      </Link>
      <Link href="/contracts" aria-current={active === "contracts" ? "page" : undefined}>
        지자체 수의계약
      </Link>
    </nav>
  );
}
