/**
 * 《林序 / 折光之间》— V11 几何：一件紧凑装置，三棱楔体承载五个方向
 *
 * 用户否定 V10 的核心理由：**按章节切投影、改透明度、换图**。
 * V11 的原则是：五套图文永远固定在实体的真实表面上，不随相机改变；
 * 只有相机在动，靠真实遮挡在不同角度自然拼成平面。
 *
 * 三件主实体不再是矩形挤出，而是**三棱楔体**：
 *   前面法线 +Z                        → 首页
 *   右后侧法线 [ √3/2, 0, -1/2 ]        → 关于（az 120°）
 *   左后侧法线 [-√3/2, 0, -1/2 ]        → 作品（az 240°）
 *   三面**属于同一件实体**（不是三块板），底面法线 -Y → 方法
 * 而厚环与圆盘的顶面法线 +Y → 索引。
 * 五个方向的承载面互不正视，所以五套图文可以同时存在于同一件装置上。
 *
 * 楔体的构造：取 V7 已认可的正面 XY 轮廓，在 XZ 平面里向后收束到一条
 * 竖向脊线 —— 前缘 x ∈ [a,b]、z = zFront，脊线 x = (a+b)/2、
 * z = zFront − (b−a)·√3/2。侧面与脊线沿 Y 逐层跟随原轮廓的顶端曲线闭合，
 * 所以鼓的半圆、屏的斜切顶都真实延续到楔子的两个斜面上。
 */

export const PALETTE = {
  paper: '#FFFFFF',
  ink: '#9F281D',
  vermilion: '#BD3728',
  cobalt: '#D83C2D',
  sand: '#F7C3B5',
  moss: '#D83C2D',
  body: '#FFFFFF',
};

/** 全场唯一的相机中心，没有任何分组平移 */
export const CENTER = [0, 0.3, 0];

const SQ32 = Math.sqrt(3) / 2;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dir = (azDeg, elDeg) => {
  const a = (azDeg * Math.PI) / 180, e = (elDeg * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
};

/* ------------------------------------------------------------------ *
 * 五个阅读基。三个楔面恰好对上 about / works，底面对上 method，
 * 环与盘顶面对上 index，楔体前面对上 home。
 * ------------------------------------------------------------------ */

const DEFS = {
  home: { n: dir(0, 0), up: [0, 1, 0], region: { a: [-6, 6], b: [-2.6, 3.2] } },
  about: { n: dir(120, 0), up: [0, 1, 0], region: { a: [-6, 6], b: [-2.6, 3.2] } },
  works: { n: dir(240, 0), up: [0, 1, 0], region: { a: [-6, 6], b: [-2.6, 3.2] } },
  method: { n: [0, -1, 0], up: [0, 0, 1], region: { a: [-6, 6], b: [-5, 4] } },
  index: { n: [0, 1, 0], up: [0, 0, -1], region: { a: [-6, 6], b: [-5, 5] } },
};

export const BASES = {};
for (const [id, d] of Object.entries(DEFS)) {
  const n = norm(d.n);
  const right = norm(cross(d.up, n));
  BASES[id] = { normal: n, right, up: cross(n, right), region: d.region };
}

/**
 * 采样门限。home / index 卡 0.999 —— 它们的构图必须逐字不变；
 * 三个中间视点放到 0.70（≈45.6°），各自只取到真正朝向自己的那一组楔面，
 * 不会把别页的面也印上文字。这是几何事实，不是按相机切图。
 */
export const FORWARD_MIN = {
  home: 0.999, index: 0.999, about: 0.70, works: 0.70, method: 0.70,
};

/* 轮廓工具 */
const arcPts = (cx, cy, r, a0, a1, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });

const circle = (cx, cy, r, n = 44) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
  });

export const MASSES = [
  /* ══ 三件主实体：三棱楔体 ════════════════════════════════════════
     正面轮廓与前面位置逐位沿用 V7（首页视觉基准），只在背面换成楔形。 */

  // 西屏：正面带一段大圆弧顶。a,b = −5.6…−2.4 → 脊线 x = −4.0，z = 0.25 − 2.771
  { id: 'wedge-west', kind: 'wedge', zFront: 0.25, ink: { home: 'cobalt' },
    poly: [[-5.6, -2.4], [-2.4, -2.4], ...arcPts(-4.0, 0.6, 1.6, 0, Math.PI * 0.42, 14), [-5.6, 2.75]] },

  // 东屏：正面顶面带一段斜切。a,b = −2.2…1.6 → 脊线 x = −0.3，z = 1.35 − 3.291
  { id: 'wedge-east', kind: 'wedge', zFront: 1.35, ink: {},
    poly: [[-2.2, -2.4], [1.6, -2.4], [1.6, 0.9], [0.2, 1.7], [-2.2, 1.7]] },

  // 东鼓：正面是真半圆。a,b = 2.1…5.9 → 脊线 x = 4.0，z = 1.8 − 3.291
  { id: 'wedge-drum', kind: 'wedge', zFront: 1.8, ink: {},
    poly: [[2.1, -1.7], [5.9, -1.7], ...arcPts(4.0, -1.7, 1.9, 0, Math.PI, 26)] },

  /* ══ 索引的厚环与厚盘：顶面 +Y 供索引，底面 −Y 供方法 ══════════════ */

  { id: 'ring-court', kind: 'slab', n: [0, 1, 0], ax: [1, 0, 0], bx: [0, 0, -1], o: [0, 0, 0],
    w: [3.35, 3.9], ink: { index: 'sand' },
    poly: circle(0.9, -0.2, 3.1, 44), holes: [circle(0.9, -0.2, 1.6, 30)] },

  { id: 'disc-south', kind: 'slab', n: [0, 1, 0], ax: [1, 0, 0], bx: [0, 0, -1], o: [0, 0, 0],
    w: [2.9, 3.2], ink: { index: 'moss' },
    poly: circle(-1.8, 2.4, 2.3, 40) },

  /* ══ 第 6 件：真实共享曲台 curved-shelf ══════════════════════════
     中心与 ring-court 同心（x 0.9 / z 0.2），半径更小的一枚椭圆台，
     位于厚环下方 y[−2.65, −2.5]，填住仰视时环心与两个楔体之间的缺口。
     它的底面（法线 −Y）补方法页的空隙，顶面与侧壁在索引俯视里也读得到 ——
     同一件料服务两个方向，不是一页专用板。 */
  { id: 'curved-shelf', kind: 'slab', n: [0, 1, 0], ax: [1, 0, 0], bx: [0, 0, -1], o: [0, 0, 0],
    w: [-2.65, -2.5], ink: {},
    poly: Array.from({ length: 64 }, (_, i) => {
      const t = (i / 64) * Math.PI * 2;
      return [0.9 + 2.05 * Math.cos(t), -0.2 + 1.7 * Math.sin(t)];
    }) },
];

export const PLANE_OF = {
  'wedge-west': 'home', 'wedge-east': 'home', 'wedge-drum': 'home',
  'ring-court': 'index', 'disc-south': 'index',
};
