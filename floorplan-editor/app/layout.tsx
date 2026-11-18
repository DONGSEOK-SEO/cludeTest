import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "간편 평면도 에디터",
  description: "모눈 위에 벽을 그리고 DXF로 내보내는 평면도 편집기",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
