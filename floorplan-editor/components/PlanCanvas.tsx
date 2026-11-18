"use client";

// 모눈 캔버스. 화면(px)과 도면(mm)을 분리합니다.
// Konva 레이어 안의 좌표는 모두 mm이고, 확대·이동은 Stage의 scale/position으로만 처리합니다.
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import {
  DEFAULT_OPENING_WIDTH,
  DEFAULT_THICKNESS,
  GRID_MM,
  MAJOR_GRID_MM,
  type Opening,
  type OpeningKind,
  type PlanObject,
  type Point,
  type Segment,
  type Wall,
  type WallKind,
  arcPoints,
  constrainOrthogonal,
  formatMm,
  hitTest,
  isHorizontal,
  openingBounds,
  openingGeometry,
  placeOpening,
  snapToGrid,
  wallBounds,
  wallLength,
  wallOutline,
} from "@/lib/plan";

export type Tool = "select" | "wall" | "door" | "window" | "delete";

type View = { scale: number; x: number; y: number };

const MIN_SCALE = 0.01; // 1px = 100mm
const MAX_SCALE = 2; // 1px = 0.5mm
const MIN_MINOR_SPACING_PX = 6; // 얇은 모눈이 이보다 촘촘하면 그리지 않음
const HIT_PX = 6; // 클릭 허용 오차(px)

const C = {
  wall: "#1f2a3a",
  door: "#1f2a3a",
  window: "#2e8fd6",
  selected: "#2e6be6",
  selectedFill: "rgba(46, 107, 230, 0.18)",
  danger: "#d64545",
  dangerFill: "rgba(214, 69, 69, 0.18)",
  label: "#5b6b80",
  origin: "#e07a5f",
};

type Props = {
  walls: Wall[];
  openings: Opening[];
  tool: Tool;
  wallKind: WallKind;
  selectedId: string | null;
  onCreateWall: (start: Point, end: Point) => void;
  onPlaceOpening: (kind: OpeningKind, wall: Wall, at: Point) => void;
  onSelect: (id: string | null) => void;
  onDelete: (obj: PlanObject) => void;
  onCursor: (p: Point | null) => void;
  onMessage: (message: string) => void;
};

function objectId(o: PlanObject | null) {
  return o ? (o.type === "wall" ? o.wall.id : o.opening.id) : null;
}

function segPoints(segs: Segment[]) {
  return segs.map(([a, b]) => [a.x, a.y, b.x, b.y]);
}

export default function PlanCanvas({
  walls,
  openings,
  tool,
  wallKind,
  selectedId,
  onCreateWall,
  onPlaceOpening,
  onSelect,
  onDelete,
  onCursor,
  onMessage,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const draggedRef = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ scale: 0.08, x: 80, y: 80 });
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [hoverRaw, setHoverRaw] = useState<Point | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 도구를 바꾸거나 Esc를 누르면 그리던 벽을 취소합니다.
  const [prevTool, setPrevTool] = useState(tool);
  if (tool !== prevTool) {
    setPrevTool(tool);
    setDrawStart(null);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawStart(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const px = 1 / view.scale; // 화면 1px이 몇 mm인지

  const grid = useMemo(() => {
    const left = -view.x / view.scale;
    const top = -view.y / view.scale;
    const right = left + size.width / view.scale;
    const bottom = top + size.height / view.scale;
    const showMinor = GRID_MM * view.scale >= MIN_MINOR_SPACING_PX;
    const lines: { key: string; points: number[]; major: boolean }[] = [];
    const step = showMinor ? GRID_MM : MAJOR_GRID_MM;
    for (let x = Math.floor(left / step) * step; x <= right; x += step) {
      lines.push({ key: `v${x}`, points: [x, top, x, bottom], major: x % MAJOR_GRID_MM === 0 });
    }
    for (let y = Math.floor(top / step) * step; y <= bottom; y += step) {
      lines.push({ key: `h${y}`, points: [left, y, right, y], major: y % MAJOR_GRID_MM === 0 });
    }
    return lines;
  }, [view, size]);

  function pointerMm(): Point | null {
    const stage = stageRef.current;
    const p = stage?.getRelativePointerPosition();
    return p ? { x: p.x, y: p.y } : null;
  }

  function hitAt(p: Point | null) {
    return p ? hitTest(p, walls, openings, HIT_PX * px) : null;
  }

  function handleWheel(e: KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const factor = e.evt.deltaY > 0 ? 1 / 1.15 : 1.15;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
    const anchor = { x: (pointer.x - view.x) / view.scale, y: (pointer.y - view.y) / view.scale };
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale });
  }

  function handleMouseMove() {
    const p = pointerMm();
    if (!p) return;
    const snapped = snapToGrid(p);
    setHover(snapped);
    setHoverRaw(p);
    onCursor(snapped);
  }

  function handleClick(e: KonvaEventObject<MouseEvent>) {
    if (draggedRef.current || e.evt.button !== 0) return;
    const p = pointerMm();
    if (!p) return;
    const hit = hitAt(p);

    if (tool === "select") {
      onSelect(objectId(hit));
      return;
    }
    if (tool === "delete") {
      if (hit) onDelete(hit);
      else onMessage("지울 벽이나 문·창문을 클릭하세요.");
      return;
    }
    if (tool === "door" || tool === "window") {
      // 문·창문은 벽 위에만 놓습니다. 이미 있는 문·창문을 누르면 그 벽에 놓으려는 것으로 봅니다.
      const wall = hit?.type === "wall" ? hit.wall : hit ? walls.find((w) => w.id === hit.opening.wallId) : undefined;
      if (!wall) {
        onMessage("벽 위를 클릭해 주세요. 문·창문은 벽에만 넣을 수 있습니다.");
        return;
      }
      onPlaceOpening(tool, wall, p);
      return;
    }

    const snapped = snapToGrid(p);
    if (!drawStart) {
      setDrawStart(snapped);
      onMessage("끝점을 클릭하세요. Esc를 누르면 취소됩니다.");
      return;
    }
    const end = constrainOrthogonal(drawStart, snapped);
    if (end.x === drawStart.x && end.y === drawStart.y) {
      onMessage("벽 길이가 0mm입니다. 끝점을 다시 지정해 주세요.");
      return;
    }
    onCreateWall(drawStart, end);
    setDrawStart(null);
  }

  const hovered = tool === "wall" ? null : hitAt(hoverRaw);
  const hoveredId = objectId(hovered);

  const preview = tool === "wall" && drawStart && hover ? { start: drawStart, end: constrainOrthogonal(drawStart, hover) } : null;
  const previewWall: Wall | null =
    preview && wallLength(preview) > 0
      ? { id: "preview", ...preview, thickness: DEFAULT_THICKNESS[wallKind], kind: wallKind }
      : null;

  // 문·창문 도구: 마우스가 올라간 벽에 들어갈 자리를 점선으로 보여 줍니다.
  let openingPreview: { wall: Wall; opening: Opening } | null = null;
  if ((tool === "door" || tool === "window") && hoverRaw && hovered) {
    const wall = hovered.type === "wall" ? hovered.wall : walls.find((w) => w.id === hovered.opening.wallId);
    const width = DEFAULT_OPENING_WIDTH[tool];
    if (wall && wallLength(wall) >= width) {
      openingPreview = {
        wall,
        opening: {
          id: "preview",
          kind: tool,
          wallId: wall.id,
          offset: placeOpening(wall, hoverRaw, width),
          width,
          hingeAtEnd: false,
          swingRight: true,
        },
      };
    }
  }

  const cursor =
    tool === "wall"
      ? "crosshair"
      : tool === "door" || tool === "window"
        ? hovered
          ? "copy"
          : "not-allowed"
        : hovered
          ? "pointer"
          : "default";

  function highlight(id: string) {
    if (id === selectedId) return { stroke: C.selected, fill: C.selectedFill };
    if (id === hoveredId && tool === "delete") return { stroke: C.danger, fill: C.dangerFill };
    if (id === hoveredId && tool === "select") return { stroke: C.selected, fill: "rgba(46, 107, 230, 0.08)" };
    return null;
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", cursor }}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={view.scale}
        scaleY={view.scale}
        x={view.x}
        y={view.y}
        draggable
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
        }}
        onMouseDown={() => {
          draggedRef.current = false;
        }}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          setHover(null);
          setHoverRaw(null);
          onCursor(null);
        }}
        onClick={handleClick}
      >
        <Layer listening={false}>
          {grid.map((g) => (
            <Line
              key={g.key}
              points={g.points}
              stroke={g.major ? "#b7c3d4" : "#e3e9f1"}
              strokeWidth={g.major ? 1.2 : 1}
              strokeScaleEnabled={false}
              perfectDrawEnabled={false}
            />
          ))}
          {/* 원점 표시 */}
          <Line points={[-300, 0, 300, 0]} stroke={C.origin} strokeWidth={1} strokeScaleEnabled={false} />
          <Line points={[0, -300, 0, 300]} stroke={C.origin} strokeWidth={1} strokeScaleEnabled={false} />
        </Layer>

        <Layer listening={false}>
          {walls.map((w) => {
            const hl = highlight(w.id);
            const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
            const labelOffset = w.thickness / 2 + 14 * px;
            return (
              <Group key={w.id}>
                {hl && <Rect {...wallBounds(w)} fill={hl.fill} />}
                {segPoints(wallOutline(w, openings)).map((pts, i) => (
                  <Line key={i} points={pts} stroke={hl?.stroke ?? C.wall} strokeWidth={2} strokeScaleEnabled={false} />
                ))}
                <Text
                  x={isHorizontal(w) ? mid.x : mid.x + labelOffset}
                  y={isHorizontal(w) ? mid.y - labelOffset : mid.y}
                  text={formatMm(wallLength(w))}
                  fontSize={12}
                  fill={hl?.stroke ?? C.label}
                  scaleX={px}
                  scaleY={px}
                  offsetX={isHorizontal(w) ? 30 : 0}
                  offsetY={6}
                />
              </Group>
            );
          })}

          {openings.map((o) => {
            const w = walls.find((x) => x.id === o.wallId);
            if (!w) return null;
            const hl = highlight(o.id);
            const g = openingGeometry(w, o);
            const color = hl?.stroke ?? (o.kind === "door" ? C.door : C.window);
            return (
              <Group key={o.id}>
                {hl && <Rect {...openingBounds(w, o)} fill={hl.fill} />}
                {segPoints(g.lines).map((pts, i) => (
                  <Line key={i} points={pts} stroke={color} strokeWidth={o.kind === "window" ? 1.5 : 2} strokeScaleEnabled={false} />
                ))}
                {g.arc && (
                  <Line
                    points={arcPoints(g.arc).flatMap((p) => [p.x, p.y])}
                    stroke={color}
                    strokeWidth={1}
                    strokeScaleEnabled={false}
                  />
                )}
              </Group>
            );
          })}

          {previewWall &&
            segPoints(wallOutline(previewWall)).map((pts, i) => (
              <Line key={`p${i}`} points={pts} stroke={C.selected} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} />
            ))}
          {previewWall && hover && (
            <Text
              x={hover.x + 10 * px}
              y={hover.y + 10 * px}
              text={formatMm(wallLength(previewWall))}
              fontSize={13}
              fill={C.selected}
              scaleX={px}
              scaleY={px}
            />
          )}
          {openingPreview && (
            <Group>
              <Rect {...openingBounds(openingPreview.wall, openingPreview.opening)} fill={C.selectedFill} />
              {(() => {
                const g = openingGeometry(openingPreview.wall, openingPreview.opening);
                return (
                  <>
                    {segPoints(g.lines).map((pts, i) => (
                      <Line key={`op${i}`} points={pts} stroke={C.selected} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} />
                    ))}
                    {g.arc && (
                      <Line
                        points={arcPoints(g.arc).flatMap((p) => [p.x, p.y])}
                        stroke={C.selected}
                        strokeWidth={1}
                        dash={[6, 4]}
                        strokeScaleEnabled={false}
                      />
                    )}
                  </>
                );
              })()}
            </Group>
          )}
          {tool === "wall" && hover && <Circle x={hover.x} y={hover.y} radius={4 * px} fill={C.selected} />}
          {drawStart && <Circle x={drawStart.x} y={drawStart.y} radius={5 * px} fill={C.origin} />}
        </Layer>
      </Stage>
    </div>
  );
}
