// 수의계약 조회 화면·서버 공용 형식

export interface ContractQuery {
  region: string;
  sub: string;
  from: string;
  to: string;
  kind: string;
  method: string;
  q: string;
  company: string;
  min: number | null;
  max: number | null;
  page: number;
  sort: "date" | "amount";
}

export interface ContractItem {
  id: string;
  source: string;
  region: string;
  sub_region: string | null;
  org_name: string | null;
  dept: string | null;
  demand_org: string | null;
  title: string;
  kind: string | null;
  method: string | null;
  private_reason: string | null;
  amount: string | number | null;
  contract_date: string;
  period: string | null;
  company: string | null;
  bizno: string | null;
  bid_no: string | null;
  url: string | null;
}

export interface ContractListResult {
  rows: ContractItem[];
  total: number;
  sum: number;
  avg: number;
  companyCount: number;
  page: number;
  size: number;
  companies: { bizno: string | null; company: string | null; n: number; total: number }[];
  methods: string[];
  sources: { source: string; last_day: string | null; last_update: string | null }[];
}

export const SOURCE_LABEL: Record<string, string> = {
  g2b_api: "조달청 계약정보 API",
  andong_web: "안동시 홈페이지",
  seongnam_web: "성남시 홈페이지",
};
