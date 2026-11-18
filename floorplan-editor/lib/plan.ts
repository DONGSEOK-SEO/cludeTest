// 도면 데이터와 좌표 계산.
// 모든 좌표와 길이는 mm 단위입니다. 화면(px)과 관련된 값은 여기 두지 않습니다.
// 화면 좌표계처럼 y는 아래쪽이 + 입니다. CAD(위쪽이 +)로 바꿀 때는 toCad()만 씁니다.

export type Point = { x: number; y: number };
export type Segment = [Point, Point];

export type WallKind = "exterior" | "interior";

export type Wall = {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  kind: WallKind;
};

export type OpeningKind = "door" | "window";

// 문·창문은 벽에 붙어 있습니다. 위치는 벽 시작점에서 개구부 시작 모서리까지의 거리(mm)입니다.
export type Opening = {
  id: string;
  kind: OpeningKind;
  wallId: string;
  offset: number;
  width: number;
  // 문만 사용: 경첩이 벽 끝점 쪽이면 true, 열리는 쪽이 벽 진행 방향의 오른쪽(+법선)이면 true
  hingeAtEnd: boolean;
  swingRight: boolean;
};

export type PlanObject = { type: "wall"; wall: Wall } | { type: "opening"; opening: Opening };

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

export const OPENING_LABEL: Record<OpeningKind, string> = { door: "문", window: "창문" };
export const DEFAULT_OPENING_WIDTH: Record<OpeningKind, number> = { door: 900, window: 1200 };
export const OPENING_WIDTH_RANGE: Record<OpeningKind, [number, number]> = {
  door: [600, 2400],
  window: [300, 6000],
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

// 벽 기준 좌표: s = 시작점에서 벽 방향으로 간 거리, t = 중심선에서 법선 방향(진행 방향 오른쪽 +)으로 떨어진 거리
function wallFrame(w: Wall) {
  const len = wallLength(w) || 1;
  const u = { x: (w.end.x - w.start.x) / len, y: (w.end.y - w.start.y) / len };
  const n = { x: -u.y, y: u.x };
  const at = (s: number, t: number): Point => ({
    x: w.start.x + u.x * s + n.x * t,
    y: w.start.y + u.y * s + n.y * t,
  });
  return { len, u, n, at };
}

export function wallLocal(w: Wall, p: Point): { s: number; t: number } {
  const { u, n } = wallFrame(w);
  const d = { x: p.x - w.start.x, y: p.y - w.start.y };
  return { s: d.x * u.x + d.y * u.y, t: d.x * n.x + d.y * n.y };
}

// 벽의 두 줄(투라인)과 양 끝 마감선. 문·창문 자리는 비우고 그 양쪽에 마감선을 넣습니다.
export function wallOutline(w: Wall, openings: Opening[] = []): Segment[] {
  const h = w.thickness / 2;
  const { len, at } = wallFrame(w);
  const gaps = openings
    .filter((o) => o.wallId === w.id)
    .map((o) => [Math.max(0, o.offset), Math.min(len, o.offset + o.width)] as const)
    .sort((a, b) => a[0] - b[0]);

  const segs: Segment[] = [];
  let s = 0;
  for (const [a, b] of gaps) {
    if (a > s) {
      segs.push([at(s, -h), at(a, -h)], [at(s, h), at(a, h)]);
    }
    segs.push([at(a, -h), at(a, h)], [at(b, -h), at(b, h)]);
    s = Math.max(s, b);
  }
  if (len > s) segs.push([at(s, -h), at(len, -h)], [at(s, h), at(len, h)]);
  if (gaps.length === 0 || gaps[0][0] > 0) segs.push([at(0, -h), at(0, h)]);
  if (gaps.length === 0 || gaps[gaps.length - 1][1] < len) segs.push([at(len, -h), at(len, h)]);
  return segs;
}

export type Arc = { center: Point; radius: number; from: Point; to: Point };

// 문: 문짝 선 1개 + 열리는 궤적(호). 창문: 바깥 두 줄과 가운데 유리선.
export function openingGeometry(w: Wall, o: Opening): { lines: Segment[]; arc: Arc | null } {
  const h = w.thickness / 2;
  const { at, u, n } = wallFrame(w);
  const a = o.offset;
  const b = o.offset + o.width;
  if (o.kind === "window") {
    return {
      lines: [
        [at(a, -h), at(b, -h)],
        [at(a, 0), at(b, 0)],
        [at(a, h), at(b, h)],
      ],
      arc: null,
    };
  }
  const side = o.swingRight ? 1 : -1;
  const hingeS = o.hingeAtEnd ? b : a;
  const hinge = at(hingeS, side * h);
  const leafDir = { x: n.x * side, y: n.y * side };
  const closedDir = o.hingeAtEnd ? { x: -u.x, y: -u.y } : u;
  const leafEnd = { x: hinge.x + leafDir.x * o.width, y: hinge.y + leafDir.y * o.width };
  return {
    lines: [[hinge, leafEnd]],
    arc: { center: hinge, radius: o.width, from: leafDir, to: closedDir },
  };
}

// 호를 화면에 그리기 위한 점 목록(90° 호).
export function arcPoints(arc: Arc, steps = 24): Point[] {
  const a0 = Math.atan2(arc.from.y, arc.from.x);
  let d = Math.atan2(arc.to.y, arc.to.x) - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const ang = a0 + (d * i) / steps;
    pts.push({ x: arc.center.x + Math.cos(ang) * arc.radius, y: arc.center.y + Math.sin(ang) * arc.radius });
  }
  return pts;
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

// 문·창문이 차지하는 벽 구간의 사각형.
export function openingBounds(w: Wall, o: Opening): { x: number; y: number; width: number; height: number } {
  const h = w.thickness / 2;
  const { at } = wallFrame(w);
  const p1 = at(o.offset, -h);
  const p2 = at(o.offset + o.width, h);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

// 클릭한 점에 있는 객체를 찾습니다. 문·창문을 벽보다 먼저 봅니다. tolerance는 mm.
export function hitTest(p: Point, walls: Wall[], openings: Opening[], tolerance: number): PlanObject | null {
  for (const o of [...openings].reverse()) {
    const w = walls.find((x) => x.id === o.wallId);
    if (!w) continue;
    const { s, t } = wallLocal(w, p);
    if (s >= o.offset - tolerance && s <= o.offset + o.width + tolerance && Math.abs(t) <= w.thickness / 2 + tolerance) {
      return { type: "opening", opening: o };
    }
  }
  for (const w of [...walls].reverse()) {
    const { s, t } = wallLocal(w, p);
    if (s >= -tolerance && s <= wallLength(w) + tolerance && Math.abs(t) <= w.thickness / 2 + tolerance) {
      return { type: "wall", wall: w };
    }
  }
  return null;
}

// 클릭 위치를 중심으로 문·창문 자리를 잡습니다(100mm 단위, 벽 안쪽으로 맞춤).
export function placeOpening(w: Wall, p: Point, width: number): number {
  const { s } = wallLocal(w, p);
  const len = wallLength(w);
  const offset = Math.round((s - width / 2) / GRID_MM) * GRID_MM;
  return Math.min(Math.max(0, offset), Math.max(0, len - width));
}

// 길이를 바꿀 때는 시작점을 고정하고 끝점만 같은 방향으로 옮깁니다.
export function withLength(w: Wall, length: number): Wall {
  const dx = Math.sign(w.end.x - w.start.x);
  const dy = Math.sign(w.end.y - w.start.y);
  const dir = dx === 0 && dy === 0 ? { x: 1, y: 0 } : { x: dx, y: dy };
  return { ...w, end: { x: w.start.x + dir.x * length, y: w.start.y + dir.y * length } };
}

export function validateLength(length: number, openingsOnWall: Opening[] = []): string | null {
  if (!Number.isFinite(length) || length <= 0) return "벽 길이는 0mm보다 커야 합니다. 길이를 다시 입력해 주세요.";
  if (length > MAX_LENGTH_MM) return `벽 길이는 ${MAX_LENGTH_MM.toLocaleString()}mm 이하로 입력해 주세요.`;
  const need = Math.max(0, ...openingsOnWall.map((o) => o.offset + o.width));
  if (length < need) {
    return `이 벽의 문·창문이 ${formatMm(need)}까지 있어 그보다 짧게 할 수 없습니다. 문·창문을 먼저 옮기거나 지워 주세요.`;
  }
  return null;
}

export function validateThickness(thickness: number): string | null {
  if (!Number.isFinite(thickness) || thickness < MIN_THICKNESS_MM || thickness > MAX_THICKNESS_MM) {
    return `벽 두께는 ${MIN_THICKNESS_MM}~${MAX_THICKNESS_MM.toLocaleString()}mm 사이로 입력해 주세요.`;
  }
  return null;
}

// 문·창문의 폭·위치 검사: 폭 범위, 벽 안에 들어가는지, 다른 문·창문과 겹치는지.
export function validateOpening(w: Wall, candidate: Opening, openings: Opening[]): string | null {
  const label = OPENING_LABEL[candidate.kind];
  const [min, max] = OPENING_WIDTH_RANGE[candidate.kind];
  if (!Number.isFinite(candidate.width) || candidate.width < min || candidate.width > max) {
    return `${label} 폭은 ${min.toLocaleString()}~${max.toLocaleString()}mm 사이로 입력해 주세요.`;
  }
  const len = wallLength(w);
  if (candidate.width > len) return `벽 길이(${formatMm(len)})보다 넓은 ${label}은 넣을 수 없습니다.`;
  if (!Number.isFinite(candidate.offset) || candidate.offset < 0 || candidate.offset + candidate.width > len) {
    return `${label} 위치는 0~${(len - candidate.width).toLocaleString()}mm 사이로 입력해 주세요 (벽 길이 ${formatMm(len)}).`;
  }
  const clash = openings.find(
    (o) =>
      o.id !== candidate.id &&
      o.wallId === candidate.wallId &&
      candidate.offset < o.offset + o.width &&
      o.offset < candidate.offset + candidate.width,
  );
  if (clash) return `다른 ${OPENING_LABEL[clash.kind]}과 겹칩니다. 위치나 폭을 바꿔 주세요.`;
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
