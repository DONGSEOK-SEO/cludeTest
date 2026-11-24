"use client";
// 현재 화면의 표를 엑셀로 내려받는다(라이브러리는 버튼을 누를 때 불러옴)

export interface XlsxColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | null;
  format?: string;
}

export async function downloadXlsx<T>(fileName: string, columns: XlsxColumn<T>[], rows: T[], note?: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const data: (Record<string, unknown> | null)[][] = [];
  if (note) data.push([{ value: note }], []);
  data.push(columns.map((c) => ({ value: c.header, fontWeight: "bold", backgroundColor: "#DCE6F2" })));
  for (const r of rows) {
    data.push(
      columns.map((c) => {
        const v = c.value(r);
        if (v == null || v === "") return null;
        return typeof v === "number" ? { value: v, type: Number, format: c.format ?? "#,##0" } : { value: String(v), type: String };
      }),
    );
  }
  // 라이브러리 타입이 셀 객체를 좁게 정의해 두어 여기서만 넓혀 넘긴다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await writeExcelFile(data as any, { columns: columns.map((c) => ({ width: c.width ?? 14 })) }).toBlob();
  // 파일 이름이 그대로 쓰이도록 내려받기 링크를 직접 만든다
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
