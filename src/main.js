/**
 * Five permanent artworks share one fixed sculpture.
 * Only the camera moves; no visibility, opacity, texture or lighting animation.
 */

import * as THREE from 'three';
import { BASES, CENTER } from './installation-v11.js';
import { VIEW_BY_ID, viewText, PROJECTS, BRAND, FOOTER_NOTE } from './site-content.js';
import './style.css';
import { createInstallation } from './projection-v11.js';

// Each URL hash identifies an aligned reading point, including after reload.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const PAPER = 0xffffff;
const CAM_DIST = 120;

/* ------------------------------------------------------------------ *
 * 五个阅读方向与一个过渡观察点
 *
 * 五个阅读点共用一个观察中心；方向由 BASES 统一导出。
 * 三个水平阅读方向相隔 120°；另外两个方向分别从下方和上方阅读。
 * ------------------------------------------------------------------ */

const STATES = [
  { id: 'home',    label: 'Start', plane: 'home',   az: 0,   el: 0,   up: [0, 1, 0],  halfW: 7.6,  halfH: 3.68, hint: 'A different point of view' },
  { id: 'spatial', label: 'In space', plane: null,     az: 42,  el: 20, up: [0, 1, 0],  halfW: 8.2, halfH: 5.0,  hint: 'Keep turning. Find a new angle.' },
  { id: 'about',   label: 'Story', plane: 'about',  az: 110, el: -8, up: [0, 1, 0],  halfW: 6.5,  halfH: 3.65,  hint: 'Curiosity comes first' },
  { id: 'works',   label: 'Projects', plane: 'works',  az: 210, el: -12, up: [0, 1, 0],  halfW: 6.5,  halfH: 3.65,  hint: 'Four things to explore' },
  { id: 'method',  label: 'Process', plane: 'method', az: 360, el: -90, up: [0, 0, 1], halfW: 7.3, halfH: 4.9,  hint: 'Try. Play. Repeat.' },
  { id: 'index',   label: 'Index', plane: 'index',  az: 270, el: 90, up: [0, 0, -1], halfW: 8.4,  halfH: 7.0,  hint: 'Choose your next angle' },
];
// Read geometry, text projection and camera from the same fixed basis.
for (const st of STATES) {
  if (!st.plane) continue;
  st.up = BASES[st.plane].up;
  const n = BASES[st.plane].normal;
  if (Math.abs(n[1]) < .999) st.az = (Math.atan2(n[0], n[2]) * 180 / Math.PI + 360) % 360;
  st.el = Math.asin(n[1]) * 180 / Math.PI;
}
const NAV = ['home', 'about', 'works', 'method', 'index'];

/* ------------------------------------------------------------------ *
 * 渲染器 / 场景
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Use an integer 2x backing buffer even on 1x displays, avoiding fractional
// downsampling of the fine printed strokes. The scene remains capped at 2x.
const renderPixelRatio=()=>2;
renderer.setPixelRatio(renderPixelRatio());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The sculpture and studio lights are fixed; bake the shadow once.
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER);

// Neutral studio lighting keeps the material white while showing its volume.
// Nothing is attached to the camera or changed when a chapter aligns.
scene.add(new THREE.AmbientLight(0xffffff, 1.65));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(-3, 6, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left:-10, right:10, top:9, bottom:-9, near:.1, far:35});
key.shadow.normalBias = .025;
key.shadow.bias = -.00008;
key.shadow.intensity = .35;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, .5);
fill.position.set(5, 1, -8);
scene.add(fill);

/* ------------------------------------------------------------------ *
 * 同一装置的五套永久表面图文
 * ------------------------------------------------------------------ */

const { installation, solids } = createInstallation(renderer);
scene.add(installation);
renderer.shadowMap.needsUpdate = true;
const cameraDirection = new THREE.Vector3();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const lookTarget = new THREE.Vector3(...CENTER);

/* ------------------------------------------------------------------ *
 * 取景
 * ------------------------------------------------------------------ */

function fitFrustum(designW, designH, aspect) {
  const designAspect = designW / designH;
  if (aspect > designAspect) return { halfW: designH * aspect, halfH: designH };
  return { halfW: designW, halfH: designW / aspect };
}

function applyCamera(progress) {
  const f = Math.min(1, Math.max(0, progress)) * (STATES.length - 1);
  const i = Math.min(STATES.length - 2, Math.floor(f));
  const t = f - i;
  const e = t * t * (3 - 2 * t);
  const a = STATES[i];
  const b = STATES[i + 1];

  const orientation = (st) => {
    const az = THREE.MathUtils.degToRad(st.az), el = THREE.MathUtils.degToRad(st.el);
    const pos = new THREE.Vector3(Math.cos(el)*Math.sin(az), Math.sin(el), Math.cos(el)*Math.cos(az));
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos,new THREE.Vector3(),new THREE.Vector3(...st.up)));
  };
  const q = state.anim?.fromQ
    ? state.anim.fromQ.clone().slerp(orientation(STATES[Math.round(state.anim.to*5)]),state.anim.t*state.anim.t*(3-2*state.anim.t))
    : orientation(a).slerp(orientation(b),e);
  const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-state.dragEl),THREE.MathUtils.degToRad(state.dragAz),0,'YXZ'));
  q.multiply(offset);
  const halfW = lerp(a.halfW, b.halfW, e);
  const halfH = lerp(a.halfH, b.halfH, e);

  // 拖开时正交取景同步拉远，回到阅读点自动复位。
  // 只改视锥大小：偏转 20° 以上时深的那几层横向错位，不拉远构图会被切出画幅。
  const swing = clamp((Math.abs(state.dragAz) / 34) * 0.75 + (Math.abs(state.dragEl) / 16) * 0.25, 0, 1);
  const zoomOut = 1 + 0.30 * swing * swing * (3 - 2 * swing);
  const fit = fitFrustum(halfW * zoomOut, halfH * zoomOut, window.innerWidth / window.innerHeight);
  camera.left = -fit.halfW;
  camera.right = fit.halfW;
  camera.top = fit.halfH;
  camera.bottom = -fit.halfH;
  camera.updateProjectionMatrix();

  camera.quaternion.copy(q);
  camera.position.copy(new THREE.Vector3(0,0,CAM_DIST).applyQuaternion(q)).add(lookTarget);
  camera.updateMatrixWorld();
  cameraDirection.copy(camera.position).sub(lookTarget).normalize();

}

const lerp = (x, y, t) => x + (y - x) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

const state = { progress: 0, target: 0, dragAz: 0, dragEl: 0, anim: null, active: -1 };
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let scrollMax = 1;
function readScroll() {
  scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  state.target = clamp(window.scrollY / scrollMax, 0, 1);
}
window.addEventListener('scroll', readScroll, { passive: true });

function stateIndexOf(id) {
  const nav = NAV.indexOf(id);
  return nav < 0 ? 0 : nav === 0 ? 0 : nav + 1; // 首页为 0，其后每个章节前面都插了空间态
}

function goTo(index, instant = false) {
  const i = clamp(index, 0, STATES.length - 1);
  state.dragAz = 0;
  state.dragEl = 0;
  const to = i / (STATES.length - 1);
  if (instant || reduced) {
    state.progress = to;
    state.target = to;
    state.anim = null;
    window.scrollTo({ top: to * scrollMax, behavior: 'instant' });
  } else {
    state.anim = { from: state.progress, to, t: 0, fromQ: camera.quaternion.clone() };
  }
  syncHash(STATES[i].id);
}

/* 拖动微调：离开基准角度即可看到版式如何拆散。
   位移小于阈值视为「点击」，用于命中 3D 热点；超过则是拖动，绝不误触发。 */
const CLICK_SLOP = 6;
let dragging = false;
let downX = 0;
let downY = 0;
let travel = 0;
let lastX = 0;
let lastY = 0;

canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  travel = 0;
  canvas.setPointerCapture(e.pointerId);
  state.anim = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  travel += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  state.dragAz -= (e.clientX - lastX) * 0.14;
  state.dragEl += (e.clientY - lastY) * 0.12;
  lastX = e.clientX; lastY = e.clientY;
});
const endDrag = (e) => {
  dragging = false;
  if (e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// 用 click 事件判定，配合位移阈值区分「点」与「拖」。
// 挂在 pointerup 上会漏掉只派发 click 的场景，也更容易和拖动手势打架。
canvas.addEventListener('click', (e) => {
  if (travel < CLICK_SLOP) handleCanvasClick(e);
  travel = CLICK_SLOP; // 防止同一次手势重复触发
});

/* --- 2) 3D 热点：射线命中平面网格 → 用命中点 UV 反查母图登记的矩形 --- */

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** 只有「基本对齐」到某个平面视点、且没有拖动偏移时才认热点 */
function alignedViewId() {
  const up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
  return NAV.find(id=>cameraDirection.dot(new THREE.Vector3(...BASES[id].normal))>Math.cos(3*Math.PI/180)
    && up.dot(new THREE.Vector3(...BASES[id].up))>Math.cos(3*Math.PI/180)) ?? null;
}

function hitHotspot(clientX, clientY) {
  const id = alignedViewId();
  if (!id) return null;
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(solids, false)[0];
  const B=BASES[id];
  if (!hit || hit.face.normal.dot(new THREE.Vector3(...B.normal))<.9999) return null;
  const u=(hit.point.dot(new THREE.Vector3(...B.right))-B.region.a[0])/(B.region.a[1]-B.region.a[0]);
  const v=(hit.point.dot(new THREE.Vector3(...B.up))-B.region.b[0])/(B.region.b[1]-B.region.b[0]);
  for (const h of VIEW_BY_ID[id].hotspots ?? []) {
    if (u >= h.u0 && u <= h.u1 && v >= h.v0 && v <= h.v1) return h;
  }
  return null;
}

function handleCanvasClick(e) {
  const h = hitHotspot(e.clientX, e.clientY);
  if (!h) return;
  if (h.action.type === 'project') {
    // 只开项目详情。顺带开「阅读本页」抽屉会让关掉弹窗后残留一个没要过的抽屉。
    openProject(h.action.no);
  } else {
    goTo(stateIndexOf(h.action.id));
  }
}

// 悬停时给出可点提示，仍然只在对齐状态下生效
canvas.addEventListener('pointermove', (e) => {
  if (dragging) return;
  canvas.style.cursor = hitHotspot(e.clientX, e.clientY) ? 'pointer' : 'grab';
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; // 普通按键不重置相机
  const next = Math.round(state.progress * (STATES.length - 1)) + (e.key === 'ArrowRight' ? 1 : -1);
  if (next < 0 || next >= STATES.length) return;
  e.preventDefault();
  goTo(next);
});

/* ------------------------------------------------------------------ *
 * DOM：导航 / 指示 / 抽屉 / 作品详情
 * ------------------------------------------------------------------ */

const navList = document.getElementById('navList');
NAV.forEach((id, i) => {
  const view = VIEW_BY_ID[id];
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav__btn';
  btn.dataset.goto = String(stateIndexOf(id));
  btn.innerHTML = `<span class="nav__no">0${i + 1}</span><span>${view.label}</span>`;
  btn.addEventListener('click', () => { goTo(stateIndexOf(id)); fillDrawer(view.id); });
  li.appendChild(btn);
  navList.appendChild(li);
});

const readoutNo = document.getElementById('readoutNo');
const readoutName = document.getElementById('readoutName');
const readoutHint = document.getElementById('readoutHint');

const drawer = document.getElementById('drawer');
const drawerKicker = document.getElementById('drawerKicker');
const drawerTitle = document.getElementById('drawerTitle');
const drawerBody = document.getElementById('drawerBody');
const readBtn = document.getElementById('readBtn');
const drawerClose = document.getElementById('drawerClose');

function fillDrawer(viewId) {
  const t = viewText(viewId);
  drawerKicker.textContent = t.kicker;
  drawerTitle.textContent = t.title;

  const parts = [];
  if (t.body) parts.push(`<p>${t.body}</p>`);

  if (viewId === 'works') {
    parts.push('<ul class="drawer__list">');
    for (const p of PROJECTS) {
      parts.push(
        `<li><button type="button" class="projectBtn" data-project="${p.no}">` +
        `<span class="projectBtn__no">${p.no}</span>` +
        `<span class="projectBtn__name">${p.name}</span>` +
        `<span class="projectBtn__type">${p.type}</span></button></li>`,
      );
    }
    parts.push('</ul>');
  } else if (t.list?.length) {
    parts.push('<ul class="drawer__list">');
    for (const it of t.list) {
      parts.push(
        `<li class="drawer__item"><p class="drawer__itemKey">${it.key}</p>` +
        (it.text ? `<p class="drawer__itemText">${it.text}</p>` : '') + '</li>',
      );
    }
    parts.push('</ul>');
  }
  if (t.closing) parts.push(`<p class="drawer__closing">${t.closing}</p>`);
  parts.push(`<p class="drawer__note">${BRAND.name} · ${FOOTER_NOTE}</p>`);
  drawerBody.innerHTML = parts.join('');

  drawerBody.querySelectorAll('[data-project]').forEach((btn) => {
    btn.addEventListener('click', () => openProject(btn.dataset.project));
  });
}

const detail = document.getElementById('detail');
const detailBody = document.getElementById('detailBody');
const detailClose = document.getElementById('detailClose');

function openProject(no) {
  const p = PROJECTS.find((x) => x.no === no);
  if (!p) return;
  detailBody.innerHTML =
    `<p class="detail__kicker">PROJECT / ${p.no}</p>` +
    `<h2 class="detail__title">${p.name}</h2>` +
    `<p class="detail__type">${p.type}</p>` +
    `<p class="detail__lede">${p.text}</p>` +
    `<div class="detail__sect"><h3>The idea</h3><p>${p.concept}</p></div>` +
    `<div class="detail__sect"><h3>The experience</h3><p>${p.angle}</p></div>` +
    `<p class="detail__foot">An imagined project for this concept studio.</p>`;
  if (typeof detail.showModal === 'function') detail.showModal();
  else detail.setAttribute('open', '');
  detailClose.focus();
}
detailClose.addEventListener('click', () => detail.close());

function setDrawer(open) {
  drawer.hidden = !open;
  readBtn.setAttribute('aria-expanded', String(open));
  readBtn.textContent = open ? 'Close notes' : 'Read the story';
  if (open) drawerClose.focus();
}
readBtn.addEventListener('click', () => {
  setDrawer(drawer.hidden);
});
drawerClose.addEventListener('click', () => { setDrawer(false); readBtn.focus(); });

document.querySelector('.masthead__brand').addEventListener('click', (e) => {
  e.preventDefault();
  goTo(0);
});

/* ------------------------------------------------------------------ *
 * hash 深链
 * ------------------------------------------------------------------ */

/* 旧深链别名：用户书签里还留着 V2/V3 的 #A / #M / #B。
   #A = 首页、#M = 空间（原三视图的首屏与中间态），不能悄悄掉回别的页面。
   键统一转小写，#A 与 #a 等价。 */
const HASH_ALIAS = { a: 'home', m: 'spatial', b: 'works', s: 'spatial', x: 'index', h: 'home' };

function syncHash(id) {
  if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
}
function hashIndex() {
  const raw = location.hash.slice(1);
  const id = HASH_ALIAS[raw.toLowerCase()] ?? raw;
  const i = STATES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}
window.addEventListener('hashchange', () => goTo(hashIndex(), true));

/* ------------------------------------------------------------------ *
 * 主循环
 * ------------------------------------------------------------------ */

function onResize() {
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // resize 只改取景框：不重建几何、不重排文字，拼合关系不变。
  // 但窗口高度变了 scrollMax 也会变，滚动→进度的映射随之漂移，
  // 视图会悄悄偏出对齐角而看起来仍然「差不多平」。这里重新落到最近的状态。
  readScroll();
  state.target = Math.round(state.progress * (STATES.length - 1)) / (STATES.length - 1);
  window.scrollTo({ top: state.target * scrollMax, behavior: 'instant' });
}
window.addEventListener('resize', onResize);
onResize();

const clock = new THREE.Clock();
let lastActive = -1;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.anim) {
    state.anim.t = Math.min(1, state.anim.t + dt * 1.5);
    const e = state.anim.t * state.anim.t * (3 - 2 * state.anim.t);
    state.progress = lerp(state.anim.from, state.anim.to, e);
    state.target = state.progress;
    window.scrollTo({ top: state.progress * scrollMax, behavior: 'instant' });
    if (state.anim.t >= 1) state.anim = null;
  } else {
    // 温和吸附：滚动停下来且已靠近某个状态时再归位，不在途中抢镜头
    const near = Math.round(state.target * (STATES.length - 1)) / (STATES.length - 1);
    const idle = Math.abs(state.target - state.progress) < 0.004;
    const goal = idle && Math.abs(state.target - near) < 0.07 ? near : state.target;
    state.progress += (goal - state.progress) * Math.min(1, dt * 5);
  }

  applyCamera(state.progress);

  const aligned=alignedViewId();
  const idx = aligned ? stateIndexOf(aligned) : 1;
  if (idx !== lastActive) {
    lastActive = idx;
    const s = STATES[idx];
    readoutNo.textContent = s.plane ? `${String(NAV.indexOf(s.id) + 1).padStart(2, '0')}` : '··';
    readoutName.textContent = s.label;
    readoutHint.textContent = s.hint;
    document.querySelectorAll('[data-goto]').forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.goto) === idx);
    });
    if (s.id !== 'spatial') fillDrawer(s.id);
  }

  renderer.render(scene, camera);
}

readScroll();
const start = hashIndex();
state.progress = start / (STATES.length - 1);
state.target = state.progress;
window.scrollTo(0, state.progress * scrollMax);
fillDrawer(STATES[start].id);
applyCamera(state.progress);
renderer.render(scene, camera); // 首帧立即出画
frame();
