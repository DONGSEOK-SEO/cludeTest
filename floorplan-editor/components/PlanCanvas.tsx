"use client";

// 모눈 캔버스. 화면(px)과 도면(mm)을 분리합니다.
// Konva 레이어 안의 좌표는 모두 mm이고, 확대·이동은 Stage의 scale/position으로만 처리합니다.
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import {
  GRID_MM,
  MAJOR_GRID_MM,
  type Point,
  type Wall,
  type WallKind,
  DEFAULT_THICKNESS,
  constrainOrthogonal,
  formatMm,
  isHorizontal,
  snapToGrid,
  wallBounds,
  wallLength,
  wallOutline,
} from "@/lib/plan";

export type Tool = "select" | "wall";

type View = { scale: number; x: number; y: number };

const MIN_SCALE = 0.01; // 1px = 100mm
const MAX_SCALE = 2; // 1px = 0.5mm
const MIN_MINOR_SPACING_PX = 6; // 얇은 모눈이 이보다 촘촘하면 그리지 않음

type Props = {
  walls: Wall[];
  tool: Tool;
  wallKind: WallKind;
  selectedId: string | null;
  onCreateWall: (start: Point, end: Point) => void;
  onSelect: (id: string | null) => void;
  onCursor: (p: Point | null) => void;
  onMessage: (message: string) => void;
};

export default function PlanCanvas({ walls, tool, wallKind, selectedId, onCreateWall, onSelect, onCursor, onMessage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const draggedRef = useRef(false);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ scale: 0.08, x: 80, y: 80 });
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

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
    onCursor(snapped);
  }

  function handleClick(e: KonvaEventObject<MouseEvent>) {
    if (draggedRef.current || e.evt.button !== 0) return;
    const p = pointerMm();
    if (!p) return;
    const snapped = snapToGrid(p);

    if (tool === "select") {
      // 벽을 누르면 벽의 onClick이 먼저 처리하고, 빈 곳을 누르면 선택 해제
      if (e.target === e.target.getStage()) onSelect(null);
      return;
    }

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

  const preview = drawStart && hover ? { start: drawStart, end: constrainOrthogonal(drawStart, hover) } : null;
  const previewWall: Wall | null =
    preview && wallLength(preview) > 0
      ? { id: "preview", ...preview, thickness: DEFAULT_THICKNESS[wallKind], kind: wallKind }
      : null;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", cursor: tool === "wall" ? "crosshair" : "default" }}>
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
          <Line points={[-300, 0, 300, 0]} stroke="#e07a5f" strokeWidth={1} strokeScaleEnabled={false} />
          <Line points={[0, -300, 0, 300]} stroke="#e07a5f" strokeWidth={1} strokeScaleEnabled={false} />
        </Layer>

        <Layer>
          {walls.map((w) => {
            const b = wallBounds(w);
            const selected = w.id === selectedId;
            const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
            const labelOffset = w.thickness / 2 + 14 * px;
            return (
              <Group key={w.id}>
                <Rect
                  {...b}
                  fill={selected ? "rgba(46, 107, 230, 0.18)" : "rgba(0,0,0,0.001)"}
                  listening={tool === "select"}
                  onClick={(e) => {
                    if (draggedRef.current) return;
                    e.cancelBubble = true;
                    onSelect(w.id);
                  }}
                  onMouseEnter={(e) => {
                    if (tool === "select") e.target.getStage()!.container().style.cursor = "pointer";
                  }}
                  onMouseLeave={(e) => {
                    e.target.getStage()!.container().style.cursor = "";
                  }}
                />
                {wallOutline(w).map(([a, c], i) => (
                  <Line
                    key={i}
                    points={[a.x, a.y, c.x, c.y]}
                    stroke={selected ? "#2e6be6" : "#1f2a3a"}
                    strokeWidth={2}
                    strokeScaleEnabled={false}
                    listening={false}
                  />
                ))}
                <Text
                  x={isHorizontal(w) ? mid.x : mid.x + labelOffset}
                  y={isHorizontal(w) ? mid.y - labelOffset : mid.y}
                  text={formatMm(wallLength(w))}
                  fontSize={12}
                  fill={selected ? "#2e6be6" : "#5b6b80"}
                  scaleX={px}
                  scaleY={px}
                  offsetX={isHorizontal(w) ? 30 : 0}
                  offsetY={isHorizontal(w) ? 6 : 6}
                  listening={false}
                />
              </Group>
            );
          })}

          {previewWall &&
            wallOutline(previewWall).map(([a, c], i) => (
              <Line
                key={`p${i}`}
                points={[a.x, a.y, c.x, c.y]}
                stroke="#2e6be6"
                strokeWidth={1.5}
                dash={[6, 4]}
                strokeScaleEnabled={false}
                listening={false}
              />
            ))}
          {previewWall && hover && (
            <Text
              x={hover.x + 10 * px}
              y={hover.y + 10 * px}
              text={formatMm(wallLength(previewWall))}
              fontSize={13}
              fill="#2e6be6"
              scaleX={px}
              scaleY={px}
              listening={false}
            />
          )}
          {tool === "wall" && hover && (
            <Circle x={hover.x} y={hover.y} radius={4 * px} fill="#2e6be6" listening={false} />
          )}
          {drawStart && <Circle x={drawStart.x} y={drawStart.y} radius={5 * px} fill="#e07a5f" listening={false} />}
        </Layer>
      </Stage>
    </div>
  );
}
