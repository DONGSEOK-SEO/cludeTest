"use client";

// 화면 5개 구역(상단·왼쪽·중앙·오른쪽·아래쪽)과 도면 상태를 관리합니다.
// 이번 샘플 범위: 모눈 + 벽체 그리기·수정 + DXF 내보내기
import dynamic from "next/dynamic";
import { useState } from "react";
import { downloadDxf } from "@/lib/dxf";
import {
  type Point,
  type Wall,
  type WallKind,
  DEFAULT_THICKNESS,
  GRID_MM,
  WALL_KIND_LABEL,
  formatMm,
  newId,
  toCad,
  validateLength,
  validateThickness,
  wallLength,
  withLength,
} from "@/lib/plan";
import type { Tool } from "./PlanCanvas";
import styles from "./FloorplanEditor.module.css";

// Konva는 브라우저에서만 동작하므로 서버 렌더링을 끕니다.
const PlanCanvas = dynamic(() => import("./PlanCanvas"), { ssr: false });

const TOOL_LABEL: Record<Tool, string> = { select: "선택", wall: "벽" };

export default function FloorplanEditor() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [tool, setTool] = useState<Tool>("wall");
  const [wallKind, setWallKind] = useState<WallKind>("exterior");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [message, setMessage] = useState("모눈에서 시작점과 끝점을 클릭해 벽을 그리세요.");

  const selected = walls.find((w) => w.id === selectedId) ?? null;

  function createWall(start: Point, end: Point) {
    const wall: Wall = { id: newId("wall"), start, end, thickness: DEFAULT_THICKNESS[wallKind], kind: wallKind };
    setWalls((ws) => [...ws, wall]);
    setMessage(`${WALL_KIND_LABEL[wallKind]} ${formatMm(wallLength(wall))}를 만들었습니다.`);
  }

  function updateWall(id: string, patch: (w: Wall) => Wall) {
    setWalls((ws) => ws.map((w) => (w.id === id ? patch(w) : w)));
  }

  function resetProject() {
    if (walls.length > 0 && !window.confirm("그린 벽을 모두 지우고 새로 시작할까요?")) return;
    setWalls([]);
    setSelectedId(null);
    setMessage("새 도면을 시작했습니다.");
  }

  function exportDxf() {
    if (walls.length === 0) {
      setMessage("내보낼 벽이 없습니다. 먼저 벽을 그려 주세요.");
      return;
    }
    downloadDxf(walls);
    setMessage(`DXF를 내려받았습니다 (벽 ${walls.length}개, 단위 mm).`);
  }

  const cad = cursor ? toCad(cursor) : null;

  return (
    <div className={styles.app}>
      {/* ① 상단: 전체 작업 관리 */}
      <header className={styles.top}>
        <h1 className={styles.title}>간편 평면도 에디터</h1>
        <div className={styles.topActions}>
          <button type="button" className={styles.button} onClick={resetProject}>
            새로 만들기
          </button>
          <button type="button" className={styles.button} disabled title="다음 단계에서 구현">
            저장
          </button>
          <button type="button" className={styles.button} disabled title="다음 단계에서 구현">
            불러오기
          </button>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={exportDxf}>
            DXF 내보내기
          </button>
        </div>
      </header>

      {/* ② 왼쪽: 도구 */}
      <aside className={styles.tools}>
        <h2 className={styles.panelTitle}>도구</h2>
        {(["select", "wall"] as Tool[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tool} ${tool === t ? styles.toolActive : ""}`}
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
          >
            {TOOL_LABEL[t]}
          </button>
        ))}
        {tool === "wall" && (
          <fieldset className={styles.kind}>
            <legend>벽 종류</legend>
            {(["exterior", "interior"] as WallKind[]).map((k) => (
              <label key={k}>
                <input type="radio" name="wallKind" checked={wallKind === k} onChange={() => setWallKind(k)} />
                {WALL_KIND_LABEL[k]} {DEFAULT_THICKNESS[k]}mm
              </label>
            ))}
          </fieldset>
        )}
        {["문", "창문", "삭제"].map((label) => (
          <button key={label} type="button" className={styles.tool} disabled title="다음 단계에서 구현">
            {label}
          </button>
        ))}
      </aside>

      {/* ③ 중앙: 모눈 캔버스 */}
      <main className={styles.canvas}>
        <PlanCanvas
          walls={walls}
          tool={tool}
          wallKind={wallKind}
          selectedId={selectedId}
          onCreateWall={createWall}
          onSelect={setSelectedId}
          onCursor={setCursor}
          onMessage={setMessage}
        />
      </main>

      {/* ④ 오른쪽: 선택 객체 속성 */}
      <aside className={styles.props}>
        <h2 className={styles.panelTitle}>속성</h2>
        {selected ? (
          <WallProperties
            key={selected.id + selected.thickness + wallLength(selected)}
            wall={selected}
            onChange={(patch) => updateWall(selected.id, patch)}
            onMessage={setMessage}
          />
        ) : (
          <p className={styles.hint}>[선택] 도구로 벽을 클릭하면 길이와 두께를 수정할 수 있습니다.</p>
        )}
      </aside>

      {/* ⑤ 아래쪽: 상태 표시 */}
      <footer className={styles.status}>
        <span>
          현재 도구: {TOOL_LABEL[tool]}
          {tool === "wall" ? ` (${WALL_KIND_LABEL[wallKind]} ${DEFAULT_THICKNESS[wallKind]}mm)` : ""}
        </span>
        <span>스냅: {GRID_MM}mm</span>
        <span>단위: mm</span>
        <span data-testid="cursor">{cad ? `X ${cad.x.toLocaleString()} / Y ${cad.y.toLocaleString()} mm` : "X - / Y -"}</span>
        <span>벽 {walls.length}개</span>
        <span className={styles.message} role="status">
          {message}
        </span>
      </footer>
    </div>
  );
}

function WallProperties({
  wall,
  onChange,
  onMessage,
}: {
  wall: Wall;
  onChange: (patch: (w: Wall) => Wall) => void;
  onMessage: (m: string) => void;
}) {
  const [length, setLength] = useState(String(Math.round(wallLength(wall))));
  const [thickness, setThickness] = useState(String(wall.thickness));
  // 다른 벽을 고르거나 값이 반영되면 이 컴포넌트가 새로 만들어지므로(key) 오류도 초기화됩니다.
  const [error, setError] = useState<string | null>(null);

  function applyLength() {
    const value = Number(length);
    const err = validateLength(value);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onChange((w) => withLength(w, value));
    onMessage(`벽 길이를 ${formatMm(value)}로 바꿨습니다.`);
  }

  function applyThickness() {
    const value = Number(thickness);
    const err = validateThickness(value);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onChange((w) => ({ ...w, thickness: value }));
    onMessage(`벽 두께를 ${formatMm(value)}로 바꿨습니다.`);
  }

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>객체</span>
        <input value="벽" readOnly />
      </label>
      <label className={styles.field}>
        <span>길이 (mm)</span>
        <input
          aria-label="벽 길이"
          inputMode="numeric"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          onBlur={applyLength}
          onKeyDown={(e) => e.key === "Enter" && applyLength()}
        />
      </label>
      <label className={styles.field}>
        <span>두께 (mm)</span>
        <input
          aria-label="벽 두께"
          inputMode="numeric"
          value={thickness}
          onChange={(e) => setThickness(e.target.value)}
          onBlur={applyThickness}
          onKeyDown={(e) => e.key === "Enter" && applyThickness()}
        />
      </label>
      <label className={styles.field}>
        <span>종류</span>
        <select
          aria-label="벽 종류"
          value={wall.kind}
          onChange={(e) => {
            const kind = e.target.value as WallKind;
            onChange((w) => ({ ...w, kind }));
          }}
        >
          <option value="exterior">외벽</option>
          <option value="interior">내벽</option>
        </select>
      </label>
      <p className={styles.hint}>
        시작점 (X {toCad(wall.start).x.toLocaleString()}, Y {toCad(wall.start).y.toLocaleString()})은 고정되고 끝점이
        움직입니다. Enter 또는 칸을 벗어나면 반영됩니다.
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
