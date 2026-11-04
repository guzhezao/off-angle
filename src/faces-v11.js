/**
 * V11 几何构造：楔体与厚板 → 世界坐标的非索引三角网格
 *
 * kind = 'wedge'：三棱楔体
 *   正面 = V7 轮廓，在 z = zFront 的平面上；
 *   两条斜侧面从正面左右边缘向后收束到一条竖向脊线；
 *   脊线 x = (a+b)/2，z = zFront − (b−a)·√3/2。
 *   于是右后侧面法线恰好是 [ √3/2, 0, −1/2 ]（az 120° → 关于），
 *   左后侧面法线恰好是 [−√3/2, 0, −1/2 ]（az 240° → 作品），
 *   正面 +Z → 首页，底面 −Y → 方法。三面同属**一件**实体。
 *
 * kind = 'slab'：厚板/厚环/厚盘，沿 n 挤出（索引环与盘用）。
 *
 * 全部输出世界坐标、non-indexed，UV 由任意阅读基做世界点积得到，
 * 与相机无关 —— 图文永远长在这些面上。
 */

import * as THREE from 'three';
import { MASSES, BASES, FORWARD_MIN } from './installation-v11.js';

const SQ32 = Math.sqrt(3) / 2;



function clipHalf(P, keepLE, xc) {
  const out = [];
  const inside = (p) => (keepLE ? p.x <= xc + 1e-9 : p.x >= xc - 1e-9);
  const cut = (p, q) => new THREE.Vector2(xc, p.y + ((q.y - p.y) * (xc - p.x)) / (q.x - p.x));
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ci = inside(P[i]), cj = inside(P[j]);
    if (ci) { if (!cj) out.push(cut(P[i], P[j])); out.push(P[i].clone()); }
    else if (cj) out.push(cut(P[i], P[j]));
  }
  const ded = out.filter((q, k) => k === 0 || q.distanceTo(out[k - 1]) > 1e-7);
  while (ded.length > 1 && ded[0].distanceTo(ded[ded.length - 1]) < 1e-7) ded.pop();
  return ded.length >= 3 ? ded : [];
}

/**
 * 楔体 = 原 XY 轮廓 P（沿 Z 挤出）与 XZ 平面里固定三角足迹 T 的交集，
 * 等价于用两张固定平面裁切长挤出体：
 *   右后平面 z = zFront − √3(b−x) → 外法线 ( √3/2, 0, −1/2 )  az 120°
 *   左后平面 z = zFront − √3(x−a) → 外法线 (−√3/2, 0, −1/2 )  az 240°
 * 三张盖（正 / 左后 / 右后）在 xMid 处用**同一组切分点**，所以没有 T 接缝；
 * cap 用质心 fan，保留全部边界点，不经过 earcut，不会删掉共线点。
 * 侧壁沿轮廓原 p0→p1 方向、在 xMid 处插值打断，期望法线 [dy,−dx,0]。
 * 每个三角形都按**各自期望外法线**定向，零面积的直接丢弃 ——
 * 不做全体积翻转，因此不会出现局部反向。
 */
function buildWedge(mass) {
  let P = mass.poly.map(([x, y]) => new THREE.Vector2(x, y));
  P = P.filter((q, i) => i === 0 || q.distanceTo(P[i - 1]) > 1e-7);
  while (P.length > 1 && P[0].distanceTo(P[P.length - 1]) < 1e-7) P.pop();
  if (THREE.ShapeUtils.area(P) < 0) P.reverse();

  let a = Infinity, b = -Infinity;
  for (const v of P) { a = Math.min(a, v.x); b = Math.max(b, v.x); }
  const xMid = (a + b) / 2, zF = mass.zFront;
  const zLo = (x) => (x <= xMid ? zF - Math.sqrt(3) * (x - a) : zF - Math.sqrt(3) * (b - x));
  const NF = [0, 0, 1], NL = [-SQ32, 0, -0.5], NR = [SQ32, 0, -0.5];

  const pos = [];
  const emit = (p, q, r, exp) => {
    const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1];
    const cy = e1[2] * e2[0] - e1[0] * e2[2];
    const cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.hypot(cx, cy, cz) < 1e-9) return;               // 退化面丢弃
    if (cx * exp[0] + cy * exp[1] + cz * exp[2] < 0) {        // 与期望外法线相反 → 交换
      pos.push(p[0], p[1], p[2], r[0], r[1], r[2], q[0], q[1], q[2]);
    } else {
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
    }
  };
  const fan = (poly, zOf, exp) => {
    if (poly.length < 3) return;
    let cx = 0, cy = 0;
    for (const v of poly) { cx += v.x; cy += v.y; }
    cx /= poly.length; cy /= poly.length;
    const C = [cx, cy, zOf(cx)];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      emit(C, [p.x, p.y, zOf(p.x)], [q.x, q.y, zOf(q.x)], exp);
    }
  };

  const PL = clipHalf(P, true, xMid), PR = clipHalf(P, false, xMid);
  const zLeft = (x) => zF - Math.sqrt(3) * (x - a);
  const zRight = (x) => zF - Math.sqrt(3) * (b - x);
  fan(PL, () => zF, NF);      // 前盖左半  → +Z（首页）
  fan(PR, () => zF, NF);      // 前盖右半
  fan(PL, zLeft, NL);         // 左后切面  → az 240°（作品）
  fan(PR, zRight, NR);        // 右后切面  → az 120°（关于）

  // 侧壁：轮廓边 p0→p1 方向不变，在 xMid 处插值打断（垂直边 dx≈0 不打断）
  for (let i = 0; i < P.length; i++) {
    const p0 = P[i], p1 = P[(i + 1) % P.length];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const exp = [dy, -dx, 0];
    const cuts = [];
    if (Math.abs(dx) > 1e-9) {
      for (const t of [(xMid - p0.x) / dx]) if (t > 1e-7 && t < 1 - 1e-7) cuts.push(t);
      cuts.sort((u, v) => u - v);
    }
    const ts = [0, ...cuts, 1];
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      const Ax = p0.x + dx * t0, Ay = p0.y + dy * t0;
      const Bx = p0.x + dx * t1, By = p0.y + dy * t1;
      const za = zLo(Ax), zb = zLo(Bx);
      if (zF - za < 1e-6 && zF - zb < 1e-6) continue;   // 极左/极右厚度为 0
      emit([Ax, Ay, zF], [Bx, By, zF], [Bx, By, zb], exp);
      emit([Ax, Ay, zF], [Bx, By, zb], [Ax, Ay, za], exp);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/** 厚板 / 厚环 / 厚盘：基平面轮廓沿 n 挤出 */
function buildSlab(mass) {
  const shape = new THREE.Shape(mass.poly.map(([a, b]) => new THREE.Vector2(a, b)));
  for (const h of mass.holes ?? []) {
    shape.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
  }
  let geo = new THREE.ExtrudeGeometry(shape, {
    depth: mass.w[1] - mass.w[0], bevelEnabled: false, curveSegments: 5,
  });
  if (geo.index) geo = geo.toNonIndexed();

  const A = mass.ax, B = mass.bx, N = mass.n, w0 = mass.w[0];
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = p.getY(i), c = p.getZ(i) + w0;
    p.setXYZ(i,
      A[0] * a + B[0] * b + N[0] * c + mass.o[0],
      A[1] * a + B[1] * b + N[1] * c + mass.o[1],
      A[2] * a + B[2] * b + N[2] * c + mass.o[2]);
  }
  p.needsUpdate = true;
  return geo;
}

/** 世界坐标、非索引、带法线的实体 */
export function makeSolid(mass, material) {
  const geo = mass.kind === 'wedge' ? buildWedge(mass) : buildSlab(mass);
  geo.computeVertexNormals();
  smoothConnectingSurfaces(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = mass.id;
  return mesh;
}

// Smooth only adjoining curved wall facets. Reading planes and real creases
// retain their exact normals, so artwork stays planar and the silhouette stays
// unchanged. No new geometry or view-dependent deformation is introduced.
function smoothConnectingSurfaces(geo) {
  const p=geo.attributes.position, n=geo.attributes.normal;
  const originals=Array.from({length:n.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(n,i));
  const readingNormals=Object.values(BASES).map(b=>new THREE.Vector3(...b.normal));
  const atVertex=new Map();
  for(let i=0;i<p.count;i++){
    if(readingNormals.some(r=>r.dot(originals[i])>.9999)) continue;
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');
    if(!atVertex.has(key)) atVertex.set(key,[]);
    atVertex.get(key).push(i);
  }
  for(const indices of atVertex.values()) for(const i of indices){
    const sum=new THREE.Vector3();
    for(const j of indices) if(originals[i].dot(originals[j])>Math.cos(Math.PI/6)) sum.add(originals[j]);
    sum.normalize();n.setXYZ(i,sum.x,sum.y,sum.z);
  }
  n.needsUpdate=true;
}

/**
 * 收集朝向某阅读基的真实面。u = p·right、v = p·up，纯世界点积，
 * 与相机无关 —— 同一张面被采到多少次都指向母图上同一处。
 */
export function collectPlaneFaces(solids, planeId, onlyIds = null) {
  const B = BASES[planeId];
  const n = new THREE.Vector3(...B.normal);
  const RG = B.region;
  const FMIN = FORWARD_MIN[planeId] ?? 0.70;
  const nu = (x) => (x - RG.a[0]) / (RG.a[1] - RG.a[0]);
  const nv = (y) => (y - RG.b[0]) / (RG.b[1] - RG.b[0]);

  const positions = [];
  const uvs = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();

  for (const solid of solids) {
    if (onlyIds && !onlyIds.includes(solid.name)) continue;
    const pos = solid.geometry.attributes.position;
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      fn.crossVectors(e1, e2);
      if (fn.lengthSq() < 1e-12) continue;
      fn.normalize();
      if (fn.dot(n) < FMIN) continue;
      for (const v of [a, b, c]) {
        positions.push(v.x, v.y, v.z);
        uvs.push(
          nu(v.x * B.right[0] + v.y * B.right[1] + v.z * B.right[2]),
          nv(v.x * B.up[0] + v.y * B.up[1] + v.z * B.up[2]),
        );
      }
    }
  }
  if (!positions.length) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export { MASSES };
