// 도면 데이터를 DXF 문자열로 바꿉니다.
// 1단위 = 1mm, 모델 공간 1:1. 모눈은 넣지 않고 벽 선만 LINE으로 내보냅니다.
import { Colors, DxfWriter, LineTypes, Units, point3d } from "@tarikjabiri/dxf";
import { type Point, type Wall, toCad, wallOutline } from "./plan";

export const LAYER_WALL = "A-WALL";

function dxfPoint(p: Point) {
  const c = toCad(p);
  return point3d(c.x, c.y, 0);
}

export function buildDxf(walls: Wall[]): string {
  const dxf = new DxfWriter();
  dxf.setUnits(Units.Millimeters);
  dxf.addLayer(LAYER_WALL, Colors.White, LineTypes.Continuous);
  dxf.setCurrentLayerName(LAYER_WALL);

  for (const wall of walls) {
    for (const [a, b] of wallOutline(wall)) {
      dxf.addLine(dxfPoint(a), dxfPoint(b), { layerName: LAYER_WALL });
    }
  }
  return dxf.stringify();
}

export function downloadDxf(walls: Wall[], fileName = "floorplan.dxf"): void {
  const blob = new Blob([buildDxf(walls)], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
