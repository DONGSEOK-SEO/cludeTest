// 서버와 화면이 함께 쓰는 데이터 형식

export interface Industry {
  /** 업종코드(4자리) */
  cd: string;
  /** 업종명 */
  nm: string;
  /** 업종분류코드 */
  cc: string;
  /** 업종분류명 (예: 주택,건축,도로) */
  cn: string;
  /** 근거 법령 + 조항 (예: 건축사법 제23조) */
  law: string;
  /** 근거 법령 링크 (비어 있을 수 있음) */
  url: string;
  /** 포함면허 원문: [순번^제한업종코드^제한업종명^허용업종코드^허용업종명] */
  incl: string;
}

export interface IndustryList {
  updatedAt: string | null;
  source: "api" | "seed";
  items: Industry[];
}

export interface BidFile {
  name: string;
  url: string;
}

export interface Bid {
  no: string;
  ord: string;
  /** 공고종류 (등록공고, 변경공고, 취소공고 등) */
  kind: string;
  name: string;
  ntceInstt: string;
  dminstt: string;
  /** 'YYYY-MM-DD HH:MM' */
  ntceDt: string;
  closeDt: string;
  openDt: string;
  /** 추정가격(부가세 제외) */
  price: number | null;
  budget: number | null;
  cntrct: string;
  sucsfMthd: string;
  url: string;
  files: BidFile[];
}

export interface BidDetail {
  regions: string[];
  licenses: string[];
}

export interface Award {
  no: string;
  ord: string;
  clsfcNo: string;
  rbidNo: string;
  name: string;
  dminstt: string;
  /** 실제 개찰일시 'YYYY-MM-DD HH:MM' */
  openDt: string;
  /** 최종낙찰일 */
  fnlDate: string;
  winner: string;
  bizno: string;
  ceo: string;
  addr: string;
  /** 낙찰금액. 설계공모 등은 0으로 와서 null 로 바꾼다 */
  amt: number | null;
  /** 낙찰률(%) */
  rate: number | null;
  cnt: number | null;
}

/** 낙찰 행을 펼칠 때 입찰공고 API에서 가져오는 공고 정보 */
export interface NoticeInfo {
  ntceInstt: string;
  cntrct: string;
  sucsfMthd: string;
  price: number | null;
  budget: number | null;
  ntceDt: string;
  kind: string;
  url: string;
}

export interface WindowResult<T> {
  items: T[];
  from: string;
  to: string;
  fetchedAt: string;
  cached: boolean;
}

export type ErrorKind = "key" | "unapproved" | "quota" | "range" | "network" | "api" | "input" | "auth";

export interface ApiErrorBody {
  error: { kind: ErrorKind; message: string };
}

export interface Usage {
  date: string;
  limit: number;
  calls: { industry: number; bid: number; award: number };
}

export interface Favorites {
  codes: string[];
  /** false 이면 저장소가 오래 유지되지 않는다(Vercel에 Redis 미연결) */
  persistent: boolean;
}
