"use client";

// 화면 5개 구역(상단·왼쪽·중앙·오른쪽·아래쪽)과 도면 상태를 관리합니다.
// 범위: 모눈 + 벽·문·창문 그리기·수정·삭제 + DXF 내보내기
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { buildDxf, downloadDxf } from "@/lib/dxf";
import { zipSingle } from "@/lib/zip";
import {
  type Opening,
  type OpeningKind,
  type PlanObject,
  type Point,
  type Wall,
  type WallKind,
  DEFAULT_OPENING_WIDTH,
  DEFAULT_THICKNESS,
  GRID_MM,
  OPENING_LABEL,
  OPENING_WIDTH_RANGE,
  WALL_KIND_LABEL,
  formatMm,
  newId,
  placeOpening,
  toCad,
  validateLength,
  validateOpening,
  validateThickness,
  wallLength,
  withLength,
} from "@/lib/plan";
import type { Tool } from "./PlanCanvas";
import styles from "./FloorplanEditor.module.css";

// Konva는 브라우저에서만 동작하므로 서버 렌더링을 끕니다.
const PlanCanvas = dynamic(() => import("./PlanCanvas"), { ssr: false });

// Claude 아티팩트 화면에서 열렸을 때만 있는 파일 저장 기능
type Downloads = { save: (r: { filename: string; data: Blob | string }) => Promise<unknown> };
declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

const TOOLS: Tool[] = ["select", "wall", "door", "window", "delete"];
const TOOL_LABEL: Record<Tool, string> = { select: "선택", wall: "벽", door: "문", window: "창문", delete: "삭제" };
const TOOL_HINT: Record<Tool, string> = {
  select: "벽이나 문·창문을 클릭하면 오른쪽 속성에서 값을 바꿀 수 있습니다. Delete 키로 지웁니다.",
  wall: "모눈에서 시작점과 끝점을 클릭해 벽을 그리세요.",
  door: `벽 위를 클릭하면 폭 ${DEFAULT_OPENING_WIDTH.door.toLocaleString()}mm 문이 들어갑니다. 폭·위치·열림 방향은 속성에서 바꿉니다.`,
  window: `벽 위를 클릭하면 폭 ${DEFAULT_OPENING_WIDTH.window.toLocaleString()}mm 창문이 들어갑니다. 폭·위치는 속성에서 바꿉니다.`,
  delete: "지울 벽이나 문·창문을 클릭하세요. 벽을 지우면 그 벽의 문·창문도 함께 지워집니다.",
};

export default function FloorplanEditor() {
  const [walls, setWalls] = useState<Wall[]>([]);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [tool, setTool] = useState<Tool>("wall");
  const [wallKind, setWallKind] = useState<WallKind>("exterior");
  // 새로 그릴 벽의 두께. 종류마다 따로 기억하고 처음 값은 외벽 200mm, 내벽 100mm입니다.
  const [thicknessByKind, setThicknessByKind] = useState<Record<WallKind, number>>(DEFAULT_THICKNESS);
  const wallThickness = thicknessByKind[wallKind];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [message, setMessage] = useState(TOOL_HINT.wall);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dxfText, setDxfText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloads, setDownloads] = useState<Downloads | null>(null);

  useEffect(() => {
    window.claude
      ?.use("downloads")
      .then((d) => setDownloads((d as Downloads) ?? null))
      .catch(() => setDownloads(null));
  }, []);

  const selectedWall = walls.find((w) => w.id === selectedId) ?? null;
  const selectedOpening = openings.find((o) => o.id === selectedId) ?? null;

  // Delete/Backspace 키로 선택한 객체를 지웁니다(입력 칸에 글을 쓰는 중에는 제외).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (!selectedId) return;
      e.preventDefault();
      deleteById(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function chooseTool(t: Tool) {
    setTool(t);
    setMessage(TOOL_HINT[t]);
    if (t !== "select" && t !== "door" && t !== "window") setSelectedId(null);
  }

  function createWall(start: Point, end: Point) {
    const wall: Wall = { id: newId("wall"), start, end, thickness: wallThickness, kind: wallKind };
    setWalls((ws) => [...ws, wall]);
    setMessage(`${WALL_KIND_LABEL[wallKind]} ${formatMm(wallLength(wall))}(두께 ${wallThickness}mm)를 만들었습니다.`);
  }

  function placeNewOpening(kind: OpeningKind, wall: Wall, at: Point) {
    const width = DEFAULT_OPENING_WIDTH[kind];
    const opening: Opening = {
      id: newId(kind),
      kind,
      wallId: wall.id,
      offset: placeOpening(wall, at, width),
      width,
      hingeAtEnd: false,
      swingRight: true,
    };
    const err = validateOpening(wall, opening, openings);
    if (err) {
      setMessage(err);
      return;
    }
    setOpenings((os) => [...os, opening]);
    setSelectedId(opening.id);
    setMessage(`${OPENING_LABEL[kind]} ${formatMm(width)}를 넣었습니다. 오른쪽 속성에서 폭·위치를 바꿀 수 있습니다.`);
  }

  function updateWall(id: string, patch: (w: Wall) => Wall) {
    setWalls((ws) => ws.map((w) => (w.id === id ? patch(w) : w)));
  }

  function updateOpening(id: string, patch: Partial<Opening>) {
    setOpenings((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function deleteById(id: string) {
    const wall = walls.find((w) => w.id === id);
    const removed = wall ? [id, ...openings.filter((o) => o.wallId === id).map((o) => o.id)] : [id];
    if (selectedId && removed.includes(selectedId)) setSelectedId(null);
    if (wall) {
      const attached = openings.filter((o) => o.wallId === id).length;
      setWalls((ws) => ws.filter((w) => w.id !== id));
      setOpenings((os) => os.filter((o) => o.wallId !== id));
      setMessage(`벽을 지웠습니다${attached ? ` (문·창문 ${attached}개 함께 삭제)` : ""}.`);
    } else {
      const o = openings.find((x) => x.id === id);
      if (!o) return;
      setOpenings((os) => os.filter((x) => x.id !== id));
      setMessage(`${OPENING_LABEL[o.kind]}을 지웠습니다.`);
    }
  }

  function deleteObject(obj: PlanObject) {
    deleteById(obj.type === "wall" ? obj.wall.id : obj.opening.id);
  }

  function resetProject() {
    if (walls.length > 0) {
      setConfirmReset(true);
      return;
    }
    doReset();
  }

  function doReset() {
    setConfirmReset(false);
    setWalls([]);
    setOpenings([]);
    setSelectedId(null);
    setMessage("새 도면을 시작했습니다.");
  }

  function exportDxf() {
    if (walls.length === 0) {
      setMessage("내보낼 벽이 없습니다. 먼저 벽을 그려 주세요.");
      return;
    }
    const text = buildDxf(walls, openings);
    const summary = `벽 ${walls.length}개, 문·창문 ${openings.length}개, 단위 mm`;
    // 일반 브라우저: .dxf를 바로 내려받습니다.
    if (!window.claude) {
      downloadDxf(text);
      setMessage(`DXF를 내려받았습니다 (${summary}).`);
      return;
    }
    // Claude 아티팩트 화면: .dxf를 직접 저장할 수 없어 ZIP에 담고, 그것도 안 되면 내용을 보여 줍니다.
    if (!downloads) {
      setCopied(false);
      setDxfText(text);
      return;
    }
    downloads
      .save({ filename: "floorplan.zip", data: zipSingle("floorplan.dxf", text) })
      .then(() => setMessage(`floorplan.zip을 내려받았습니다. 압축을 풀면 floorplan.dxf가 있습니다 (${summary}).`))
      .catch((err: { code?: string }) => {
        if (err?.code === "declined") {
          setMessage("내려받기를 취소했습니다.");
        } else if (err?.code === "rate_limited") {
          setMessage("잠시 후 다시 눌러 주세요.");
        } else {
          setCopied(false);
          setDxfText(text);
        }
      });
  }

  function copyDxf() {
    if (!dxfText) return;
    navigator.clipboard
      .writeText(dxfText)
      .then(() => setCopied(true))
      .catch(() => setMessage("복사하지 못했습니다. 글상자를 눌러 전체 선택(Ctrl+A) 후 복사해 주세요."));
  }

  const cad = cursor ? toCad(cursor) : null;
  const toolDetail =
    tool === "wall"
      ? ` (${WALL_KIND_LABEL[wallKind]} ${wallThickness}mm)`
      : tool === "door" || tool === "window"
        ? ` (폭 ${DEFAULT_OPENING_WIDTH[tool].toLocaleString()}mm)`
        : "";

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
        {TOOLS.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.tool} ${tool === t ? (t === "delete" ? styles.toolDanger : styles.toolActive) : ""}`}
            aria-pressed={tool === t}
            onClick={() => chooseTool(t)}
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
                {WALL_KIND_LABEL[k]}
              </label>
            ))}
          </fieldset>
        )}
        {tool === "wall" && (
          <ToolThickness
            key={wallKind + wallThickness}
            kind={wallKind}
            value={wallThickness}
            onApply={(v) => {
              setThicknessByKind((t) => ({ ...t, [wallKind]: v }));
              setMessage(`새로 그릴 ${WALL_KIND_LABEL[wallKind]} 두께를 ${formatMm(v)}로 정했습니다.`);
            }}
          />
        )}
      </aside>

      {/* ③ 중앙: 모눈 캔버스 */}
      <main className={styles.canvas}>
        <PlanCanvas
          walls={walls}
          openings={openings}
          tool={tool}
          wallKind={wallKind}
          wallThickness={wallThickness}
          selectedId={selectedId}
          onCreateWall={createWall}
          onPlaceOpening={placeNewOpening}
          onSelect={setSelectedId}
          onDelete={deleteObject}
          onCursor={setCursor}
          onMessage={setMessage}
        />
      </main>

      {/* ④ 오른쪽: 선택 객체 속성 */}
      <aside className={styles.props}>
        <h2 className={styles.panelTitle}>속성</h2>
        {selectedWall ? (
          <WallProperties
            key={selectedWall.id + selectedWall.thickness + wallLength(selectedWall)}
            wall={selectedWall}
            openingsOnWall={openings.filter((o) => o.wallId === selectedWall.id)}
            onChange={(patch) => updateWall(selectedWall.id, patch)}
            onDelete={() => deleteById(selectedWall.id)}
            onMessage={setMessage}
          />
        ) : selectedOpening && walls.find((w) => w.id === selectedOpening.wallId) ? (
          <OpeningProperties
            key={selectedOpening.id + selectedOpening.width + selectedOpening.offset}
            opening={selectedOpening}
            wall={walls.find((w) => w.id === selectedOpening.wallId)!}
            openings={openings}
            onChange={(patch) => updateOpening(selectedOpening.id, patch)}
            onDelete={() => deleteById(selectedOpening.id)}
            onMessage={setMessage}
          />
        ) : (
          <p className={styles.hint}>[선택] 도구로 벽이나 문·창문을 클릭하면 길이·두께·폭·위치를 바꿀 수 있습니다.</p>
        )}
      </aside>

      {/* ⑤ 아래쪽: 상태 표시 */}
      <footer className={styles.status}>
        <span>
          현재 도구: {TOOL_LABEL[tool]}
          {toolDetail}
        </span>
        <span>스냅: {GRID_MM}mm</span>
        <span>단위: mm</span>
        <span data-testid="cursor">{cad ? `X ${cad.x.toLocaleString()} / Y ${cad.y.toLocaleString()} mm` : "X - / Y -"}</span>
        <span>
          벽 {walls.length}개 · 문 {openings.filter((o) => o.kind === "door").length}개 · 창문{" "}
          {openings.filter((o) => o.kind === "window").length}개
        </span>
        <span className={styles.message} role="status">
          {message}
        </span>
      </footer>

      <p className={styles.narrow}>이 샘플은 PC 화면용입니다. 넓은 화면에서 열어 주세요.</p>

      {confirmReset && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="reset-title">
          <div className={styles.dialog}>
            <h2 id="reset-title" className={styles.panelTitle}>
              새로 만들기
            </h2>
            <p>
              그린 벽 {walls.length}개{openings.length ? `와 문·창문 ${openings.length}개` : ""}를 모두 지우고 새로 시작할까요?
            </p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.button} onClick={() => setConfirmReset(false)}>
                취소
              </button>
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={doReset}>
                지우고 새로 시작
              </button>
            </div>
          </div>
        </div>
      )}

      {dxfText && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="dxf-title">
          <div className={`${styles.dialog} ${styles.dialogWide}`}>
            <h2 id="dxf-title" className={styles.panelTitle}>
              DXF 내용
            </h2>
            <p>
              이 화면에서는 파일을 바로 내려받을 수 없습니다. 아래 내용을 복사해 메모장에 붙여넣고 <b>floorplan.dxf</b> 이름으로
              저장하면 CAD에서 열 수 있습니다.
            </p>
            <textarea className={styles.dxfText} readOnly value={dxfText} onFocus={(e) => e.target.select()} />
            <div className={styles.dialogActions}>
              <button type="button" className={styles.button} onClick={() => setDxfText(null)}>
                닫기
              </button>
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={copyDxf}>
                {copied ? "복사했습니다" : "전체 복사"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 벽 도구의 두께 입력: 종류를 고르면 그 종류의 두께가 채워지고, 직접 고칠 수 있습니다.
function ToolThickness({ kind, value, onApply }: { kind: WallKind; value: number; onApply: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const preset = DEFAULT_THICKNESS[kind];

  function apply() {
    const v = Number(draft);
    if (v === value) return setError(null);
    const err = validateThickness(v);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onApply(v);
  }

  return (
    <div className={styles.toolOption}>
      <NumberField label="두께" ariaLabel="새 벽 두께" value={draft} onChange={setDraft} onApply={apply} />
      <p className={styles.hint}>
        기본값 외벽 200mm / 내벽 100mm
        {value !== preset && (
          <>
            {" "}
            <button type="button" className={styles.linkButton} onClick={() => onApply(preset)}>
              {preset}mm로 되돌리기
            </button>
          </>
        )}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// 숫자 입력 칸: Enter 또는 칸을 벗어나면 반영합니다.
function NumberField({
  label,
  ariaLabel,
  value,
  onChange,
  onApply,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <span className={styles.unitInput}>
        <input
          aria-label={ariaLabel}
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onApply}
          onKeyDown={(e) => e.key === "Enter" && onApply()}
        />
        <em>mm</em>
      </span>
    </label>
  );
}

function WallProperties({
  wall,
  openingsOnWall,
  onChange,
  onDelete,
  onMessage,
}: {
  wall: Wall;
  openingsOnWall: Opening[];
  onChange: (patch: (w: Wall) => Wall) => void;
  onDelete: () => void;
  onMessage: (m: string) => void;
}) {
  const [length, setLength] = useState(String(Math.round(wallLength(wall))));
  const [thickness, setThickness] = useState(String(wall.thickness));
  // 다른 벽을 고르거나 값이 반영되면 이 컴포넌트가 새로 만들어지므로(key) 오류도 초기화됩니다.
  const [error, setError] = useState<string | null>(null);

  function applyLength() {
    const value = Number(length);
    if (value === Math.round(wallLength(wall))) return setError(null);
    const err = validateLength(value, openingsOnWall);
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
    if (value === wall.thickness) return setError(null);
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
      <NumberField label="길이" ariaLabel="벽 길이" value={length} onChange={setLength} onApply={applyLength} />
      <NumberField label="두께" ariaLabel="벽 두께" value={thickness} onChange={setThickness} onApply={applyThickness} />
      <label className={styles.field}>
        <span>종류</span>
        <select
          aria-label="벽 종류"
          value={wall.kind}
          onChange={(e) => {
            const kind = e.target.value as WallKind;
            onChange((w) => ({ ...w, kind }));
            onMessage(`벽 종류를 ${WALL_KIND_LABEL[kind]}으로 바꿨습니다. 두께는 그대로 ${wall.thickness}mm입니다.`);
          }}
        >
          <option value="exterior">외벽</option>
          <option value="interior">내벽</option>
        </select>
      </label>
      <p className={styles.hint}>
        시작점 (X {toCad(wall.start).x.toLocaleString()}, Y {toCad(wall.start).y.toLocaleString()})은 고정되고 끝점이
        움직입니다. 종류와 두께는 따로 바꿀 수 있습니다.
        {openingsOnWall.length > 0 && ` 이 벽에 문·창문 ${openingsOnWall.length}개가 있습니다.`}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`${styles.button} ${styles.dangerButton}`} onClick={onDelete}>
        벽 삭제
      </button>
    </div>
  );
}

function OpeningProperties({
  opening,
  wall,
  openings,
  onChange,
  onDelete,
  onMessage,
}: {
  opening: Opening;
  wall: Wall;
  openings: Opening[];
  onChange: (patch: Partial<Opening>) => void;
  onDelete: () => void;
  onMessage: (m: string) => void;
}) {
  const label = OPENING_LABEL[opening.kind];
  const [width, setWidth] = useState(String(opening.width));
  const [offset, setOffset] = useState(String(opening.offset));
  const [error, setError] = useState<string | null>(null);
  const [min, max] = OPENING_WIDTH_RANGE[opening.kind];

  function apply(patch: Partial<Opening>, done: string) {
    const candidate = { ...opening, ...patch };
    const err = validateOpening(wall, candidate, openings);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onChange(patch);
    onMessage(done);
  }

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>객체</span>
        <input value={label} readOnly />
      </label>
      <NumberField
        label="폭"
        ariaLabel={`${label} 폭`}
        value={width}
        onChange={setWidth}
        onApply={() => {
          const v = Number(width);
          if (v === opening.width) setError(null);
          else apply({ width: v }, `${label} 폭을 ${formatMm(v)}로 바꿨습니다.`);
        }}
      />
      <NumberField
        label="위치"
        ariaLabel={`${label} 위치`}
        value={offset}
        onChange={setOffset}
        onApply={() => {
          const v = Number(offset);
          if (v === opening.offset) setError(null);
          else apply({ offset: v }, `${label} 위치를 벽 시작점에서 ${formatMm(v)}로 옮겼습니다.`);
        }}
      />
      {opening.kind === "door" && (
        <div className={styles.field}>
          <span>열림</span>
          <span className={styles.toggleRow}>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => {
                onChange({ hingeAtEnd: !opening.hingeAtEnd });
                onMessage("문의 경첩 위치를 반대로 바꿨습니다.");
              }}
            >
              좌우 반전
            </button>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => {
                onChange({ swingRight: !opening.swingRight });
                onMessage("문이 열리는 쪽을 반대로 바꿨습니다.");
              }}
            >
              안팎 반전
            </button>
          </span>
        </div>
      )}
      <p className={styles.hint}>
        위치는 벽 시작점에서 {label} 모서리까지의 거리입니다 (0~{(wallLength(wall) - opening.width).toLocaleString()}mm). 폭은{" "}
        {min.toLocaleString()}~{max.toLocaleString()}mm. 붙어 있는 벽: {WALL_KIND_LABEL[wall.kind]} {formatMm(wallLength(wall))}
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={`${styles.button} ${styles.dangerButton}`} onClick={onDelete}>
        {label} 삭제
      </button>
    </div>
  );
}
