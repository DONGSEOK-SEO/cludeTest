// 도면 데이터와 좌표 계산.
// 모든 좌표와 길이는 mm 단위입니다. 화면(px)과 관련된 값은 여기 두지 않습니다.
// 화면 좌표계처럼 y는 아래쪽이 + 입니다. CAD(위쪽이 +)로 바꿀 때는 toCad()만 씁니다.

export type Point = { x: number; y: number };

export type WallKind = "exterior" | "interior";

export type Wall = {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  kind: WallKind;
};

export const GRID_MM = 100;
export const MAJOR_GRID_MM = 1000;
export const MAX_LENGTH_MM = 100_000;
export const MIN_THICKNESS_MM = 50;
export const MAX_THICKNESS_MM = 1000;

export const WALL_KIND_LABEL: Record<WallKind, string> = {
  exterior: "외벽",
  interior: "내벽",
};

export const DEFAULT_THICKNESS: Record<WallKind, number> = {
  exterior: 200,
  interior: 100,
};

export function snapToGrid(p: Point, step = GRID_MM): Point {
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

// 첫 버전은 수평·수직 벽만 허용합니다. 더 많이 움직인 축을 따라갑니다.
export function constrainOrthogonal(start: Point, p: Point): Point {
  return Math.abs(p.x - start.x) >= Math.abs(p.y - start.y)
    ? { x: p.x, y: start.y }
    : { x: start.x, y: p.y };
}

export function wallLength(w: Pick<Wall, "start" | "end">): number {
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}

export function isHorizontal(w: Pick<Wall, "start" | "end">): boolean {
  return w.start.y === w.end.y;
}

// 벽의 두 줄(투라인)과 양 끝 마감선. 중심선에서 두께의 절반씩 떨어진 평행선입니다.
export function wallOutline(w: Wall): [Point, Point][] {
  const h = w.thickness / 2;
  if (isHorizontal(w)) {
    const y = w.start.y;
    const x1 = w.start.x;
    const x2 = w.end.x;
    return [
      [{ x: x1, y: y - h }, { x: x2, y: y - h }],
      [{ x: x1, y: y + h }, { x: x2, y: y + h }],
      [{ x: x1, y: y - h }, { x: x1, y: y + h }],
      [{ x: x2, y: y - h }, { x: x2, y: y + h }],
    ];
  }
  const x = w.start.x;
  const y1 = w.start.y;
  const y2 = w.end.y;
  return [
    [{ x: x - h, y: y1 }, { x: x - h, y: y2 }],
    [{ x: x + h, y: y1 }, { x: x + h, y: y2 }],
    [{ x: x - h, y: y1 }, { x: x + h, y: y1 }],
    [{ x: x - h, y: y2 }, { x: x + h, y: y2 }],
  ];
}

// 벽이 차지하는 사각형(선택 영역과 강조 표시에 사용).
export function wallBounds(w: Wall): { x: number; y: number; width: number; height: number } {
  const h = w.thickness / 2;
  const minX = Math.min(w.start.x, w.end.x);
  const minY = Math.min(w.start.y, w.end.y);
  const len = wallLength(w);
  return isHorizontal(w)
    ? { x: minX, y: minY - h, width: len, height: w.thickness }
    : { x: minX - h, y: minY, width: w.thickness, height: len };
}

// 길이를 바꿀 때는 시작점을 고정하고 끝점만 같은 방향으로 옮깁니다.
export function withLength(w: Wall, length: number): Wall {
  const dx = Math.sign(w.end.x - w.start.x);
  const dy = Math.sign(w.end.y - w.start.y);
  const dir = dx === 0 && dy === 0 ? { x: 1, y: 0 } : { x: dx, y: dy };
  return { ...w, end: { x: w.start.x + dir.x * length, y: w.start.y + dir.y * length } };
}

export function validateLength(length: number): string | null {
  if (!Number.isFinite(length) || length <= 0) return "벽 길이는 0mm보다 커야 합니다. 길이를 다시 입력해 주세요.";
  if (length > MAX_LENGTH_MM) return `벽 길이는 ${MAX_LENGTH_MM.toLocaleString()}mm 이하로 입력해 주세요.`;
  return null;
}

export function validateThickness(thickness: number): string | null {
  if (!Number.isFinite(thickness) || thickness < MIN_THICKNESS_MM || thickness > MAX_THICKNESS_MM) {
    return `벽 두께는 ${MIN_THICKNESS_MM}~${MAX_THICKNESS_MM.toLocaleString()}mm 사이로 입력해 주세요.`;
  }
  return null;
}

// 화면(아래가 +)에서 CAD(위가 +)로 바꾸는 유일한 함수. DXF 출력과 좌표 표시가 함께 씁니다.
export function toCad(p: Point): Point {
  return { x: p.x, y: p.y === 0 ? 0 : -p.y };
}

export function formatMm(value: number): string {
  return `${Math.round(value).toLocaleString()} mm`;
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
