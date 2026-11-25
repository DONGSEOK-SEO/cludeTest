// 지자체 수의계약 조회 화면
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import ContractsApp from "@/components/ContractsApp";
import { authEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "지자체 수의계약 · 빌드톡" };

export default function ContractsPage() {
  return <ContractsApp authEnabled={authEnabled()} />;
}
