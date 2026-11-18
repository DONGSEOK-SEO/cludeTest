// 도면 데이터를 DXF 문자열로 바꿉니다.
// 1단위 = 1mm, 모델 공간 1:1. 모눈은 넣지 않고 벽·문·창문 선만 내보냅니다.
import { Colors, DxfWriter, LineTypes, Units, point3d } from "@tarikjabiri/dxf";
import { type Opening, type Point, type Wall, openingGeometry, toCad, wallOutline } from "./plan";

export const LAYER_WALL = "A-WALL";
export const LAYER_DOOR = "A-DOOR";
export const LAYER_WINDOW = "A-WIND";

function dxfPoint(p: Point) {
  const c = toCad(p);
  return point3d(c.x, c.y, 0);
}

// CAD에서 호는 시작각에서 끝각까지 반시계 방향으로 그립니다(도 단위).
function cadAngle(dir: Point) {
  return (Math.atan2(-dir.y, dir.x) * 180) / Math.PI;
}

export function buildDxf(walls: Wall[], openings: Opening[] = []): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);
  dxf.addLayer(LAYER_WALL, Colors.White, LineTypes.Continuous);
  dxf.addLayer(LAYER_DOOR, Colors.Yellow, LineTypes.Continuous);
  dxf.addLayer(LAYER_WINDOW, Colors.Cyan, LineTypes.Continuous);
  dxf.setCurrentLayerName(LAYER_WALL);

  for (const wall of walls) {
    for (const [a, b] of wallOutline(wall, openings)) {
      dxf.addLine(dxfPoint(a), dxfPoint(b), { layerName: LAYER_WALL });
    }
  }
  for (const o of openings) {
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const layerName = o.kind === "door" ? LAYER_DOOR : LAYER_WINDOW;
    const g = openingGeometry(wall, o);
    for (const [a, b] of g.lines) dxf.addLine(dxfPoint(a), dxfPoint(b), { layerName });
    if (g.arc) {
      const f = { x: g.arc.from.x, y: -g.arc.from.y };
      const t = { x: g.arc.to.x, y: -g.arc.to.y };
      const ccw = f.x * t.y - f.y * t.x > 0;
      const [s, e] = ccw ? [g.arc.from, g.arc.to] : [g.arc.to, g.arc.from];
      dxf.addArc(dxfPoint(g.arc.center), g.arc.radius, cadAngle(s), cadAngle(e), { layerName });
    }
  }
  return dxf.stringify();
}

// 일반 브라우저에서 .dxf 파일을 바로 내려받습니다.
export function downloadDxf(text: string, fileName = "floorplan.dxf"): void {
  const blob = new Blob([text], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
