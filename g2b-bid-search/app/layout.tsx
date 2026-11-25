import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "나라장터 입찰·낙찰 조회",
  description: "업종별 나라장터 진행 중 입찰공고와 지난 낙찰 결과를 조회합니다 (빌드톡 사내용).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 빌드톡 사이트와 같은 Pretendard 글꼴 (불러오지 못하면 맑은 고딕 등 기본 글꼴로 표시) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
