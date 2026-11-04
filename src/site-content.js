/**
 * OFF/ANGLE: content, interactive hotspots, and five fixed compositions.
 * 图像按固定世界方向投到同一件装置；深度图裁去原本被遮挡的笔画。
 * 首页/索引沿用原构图，中间三页按圆、展开折面与拱形重新排版。
 */

import { MASSES, BASES, PALETTE } from './installation-v11.js';

// 展示体用 Fraunces Black：真实的 900 字重，字形本身有性格（wonk 终端、
// 楔形衬线），粗细来自字重而不是描边/阴影/横向压扁/人工倾斜。
const SERIF = '"Fraunces", Georgia, serif';
const SERIF_LIGHT = '"Instrument Serif", Georgia, serif';
const SANS = '"Manrope", Arial, sans-serif';
// Real typefaces, including a drawn italic, rather than synthetic distortion.
const fontSpecs=[
  ['Manrope','manrope.woff2',{weight:'200 800'}],
  ['Instrument Serif','instrument-serif.woff2',{weight:'400'}],
  ['Instrument Serif','instrument-serif-italic.woff2',{weight:'400',style:'italic'}],
  ['Fraunces','fraunces-black-normal.woff2',{weight:'900'}],
  ['Fraunces','fraunces-black-italic.woff2',{weight:'900',style:'italic'}],
];
const displayReady=Promise.all(fontSpecs.map(([family,file,descriptors])=>{
  const face=new FontFace(family,`url(${import.meta.env.BASE_URL}fonts/${file})`,descriptors);
  document.fonts.add(face);return face.load();
})).catch(()=>null);

const PAPER = PALETTE.paper;
const INK = PALETTE.ink;

/* ------------------------------------------------------------------ *
 * 文字工具
 * ------------------------------------------------------------------ */

function setFont(ctx, size, weight = 400, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function headline(ctx,text,x,y,size,{color=INK,family=SERIF,weight=900,italic=false,align='left',maxWidth=Infinity,tracking=0}={}){
  ctx.save();ctx.translate(x,y);
  if(tracking) ctx.letterSpacing=(tracking*size)+'px';
  const font=s=>`${italic?'italic ':''}${weight} ${s}px ${family}`;
  ctx.font=font(size);
  const fittedSize=size*Math.min(1,maxWidth/Math.max(1,ctx.measureText(text).width));
  ctx.font=font(fittedSize);ctx.textAlign=align;ctx.textBaseline='alphabetic';
  ctx.fillStyle=color;ctx.fillText(text,0,0);ctx.restore();
}
function caption(ctx,text,x,y,size=24,color=INK){
  ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';
  setFont(ctx,size,500,SANS);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
}
function wrap(ctx, str, x, y, maxWidth, lineHeight, align = 'left') {
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const lines = [];
  let cur = '';
  for (const ch of str) {
    if (ch === '\n') { lines.push(cur); cur = ''; continue; }
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = ch; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

function rule(ctx, x, y, w, color, thickness = 3) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, thickness);
}

/** 原创线形图形：题材相关的抽象符号，不伪造作品缩略图 */
function mark(ctx, kind, x, y, s, color, lw = 0.085) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, s * lw);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'concentric':
      for (let k = 1; k <= 4; k++) {
        ctx.moveTo(x, y + s * 0.5);
        ctx.arc(x, y + s * 0.5, (s * 0.5 * k) / 4, -0.9, 0.9);
      }
      break;
    case 'island':
      ctx.moveTo(x, y + s * 0.62); ctx.lineTo(x + s, y + s * 0.62);
      ctx.moveTo(x + s * 0.22, y + s * 0.62);
      ctx.quadraticCurveTo(x + s * 0.42, y + s * 0.08, x + s * 0.72, y + s * 0.34);
      ctx.lineTo(x + s * 0.78, y + s * 0.62);
      break;
    case 'street':
      ctx.moveTo(x + s * 0.1, y + s); ctx.lineTo(x + s * 0.34, y);
      ctx.moveTo(x + s * 0.52, y + s); ctx.lineTo(x + s * 0.52, y);
      ctx.moveTo(x + s * 0.9, y + s); ctx.lineTo(x + s * 0.66, y);
      ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x + s, y + s * 0.5);
      break;
    case 'fold':
      ctx.moveTo(x, y + s); ctx.lineTo(x, y + s * 0.28);
      ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x + s, y + s * 0.34);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s * 0.5, y); ctx.lineTo(x + s * 0.5, y + s * 0.62);
      break;
    case 'arrow':
      ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x + s * 0.78, y + s * 0.5);
      ctx.moveTo(x + s * 0.52, y + s * 0.24); ctx.lineTo(x + s * 0.8, y + s * 0.5);
      ctx.lineTo(x + s * 0.52, y + s * 0.76);
      break;
    default: ctx.rect(x, y, s, s);
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 把几何轮廓投影成母图色块
 * ------------------------------------------------------------------ */

/** 只有与该视图同轴的构件才会在这一页上有正面投影面积 */
/** V9：色块从几何轮廓按任意阅读基投影而来 */
function inkOn(mass, planeName) {
  if (!mass.ink) return null;
  if (typeof mass.ink === 'string') return mass.ink;
  return mass.ink[planeName] ?? null;
}

/** 构件在 world 空间里最"靠近该阅读基"的深度，用来由远到近叠色 */
function depthToward(mass, base) {
  const n = base.normal;
  const c = mass.o ?? [0,0,0];
  return c[0] * n[0] + c[1] * n[1] + c[2] * n[2] + (mass.zFront ?? mass.w[1]);
}

function paintSolids(ctx, planeName, W, H, onlyIds = null) {
  const base = BASES[planeName];
  const { right, up, region } = base;
  // 关键：**全装置都要画**，不能只画有 ink 的。
  // 一个纸色承载块挡在主色块前面时，它必须用纸色盖住后面已经画好的钴蓝，
  // 否则它那一片会继承后面主块的颜色。缺省色就是纸色。
  const INNER = { about: 'sand', works: 'ink', method: 'cobalt' };
  const flat = INNER[planeName];
  const list = MASSES
    .filter((m) => (planeName === 'index' ? !!m.ink?.index : flat ? m.plane === planeName : true) && (!onlyIds || onlyIds.includes(m.id)))
    .sort((p, q) => depthToward(p, base) - depthToward(q, base));

  for (const m of list) {
    // 出图面（w 大的一端）在 world 空间里的投影
    const wF = m.zFront ?? m.w[1];
    const trace = (pts) => {
      pts.forEach(([a, b], i) => {
        const P = worldPoint(m, a, b, wF);
        const u = P[0] * right[0] + P[1] * right[1] + P[2] * right[2];
        const v = P[0] * up[0] + P[1] * up[1] + P[2] * up[2];
        const px = ((u - region.a[0]) / (region.a[1] - region.a[0])) * W;
        const py = (1 - (v - region.b[0]) / (region.b[1] - region.b[0])) * H;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };
    ctx.beginPath();
    trace(m.poly ?? []);
    for (const h of m.holes ?? []) trace(h);
    ctx.fillStyle = PALETTE[flat ?? inkOn(m, planeName) ?? 'paper'];
    ctx.fill('evenodd');
  }
}

const worldPoint = (m, a, b, w) => m.kind === 'wedge' ? [a,b,w] : [
  m.o[0] + m.ax[0] * a + m.bx[0] * b + m.n[0] * w,
  m.o[1] + m.ax[1] * a + m.bx[1] * b + m.n[1] * w,
  m.o[2] + m.ax[2] * a + m.bx[2] * b + m.n[2] * w,
];

/* ------------------------------------------------------------------ *
 * 热点
 *
 * 在绘制母图的同时把可点区域按实际量到的文字位置记成 UV 矩形，
 * 于是热点永远和画面同步。主实现用射线命中平面网格后的 UV 反查这里。
 * ------------------------------------------------------------------ */

function pushHotspot(view, x, y, w, h, action, label) {
  view.hotspots.push({
    action, label,
    u0: x / view.W, u1: (x + w) / view.W,
    v0: 1 - (y + h) / view.H, v1: 1 - y / view.H,
  });
}

/* ------------------------------------------------------------------ *
 * 内容
 * ------------------------------------------------------------------ */

export const BRAND = { name: 'OFF/ANGLE', studio: 'Independent by design' };
export const TAGLINE = 'A little off. A lot more interesting.';
export const INTRO = 'An imagined design studio for identities that move, spaces that speak, and interactions that make you look twice. We turn everyday observations into unexpected encounters.';
export const DIRECTIONS = ['IDENTITY', 'INTERACTION', 'SPACE'];
export const FOOTER_NOTE = 'Imagined studio. Real curiosity.';

export const ABOUT = {
  title: 'Stay curious. Get a little lost.',
  body: 'OFF/ANGLE lives between graphic design and spatial play. We start with something familiar, change the rules, and see what happens. A poster becomes a place. A sound becomes a shape. Your movement becomes part of the story.',
  items: [
    { key: 'Make it move.', text: 'Identities with rhythm, energy, and a life beyond the logo.' },
    { key: 'Make it tangible.', text: 'Digital ideas you can step into, turn around, and play with.' },
    { key: 'Make you look twice.', text: 'A small shift in perspective can reveal a completely different story.' },
  ],
  closing: 'No default settings. No single point of view.',
};

export const PROJECTS = [
  {
    no: '01', name: 'ECHO CLUB', type: 'Sound / Identity', mark: 'concentric',
    text: 'A listening club with an identity you can hear. Its posters, room, and visual rhythm all grow from the same sound.',
    short: 'An identity with a pulse.',
    concept: 'Every recording becomes a family of shapes. Bass stretches the letters, percussion breaks the grid, and quiet passages leave room to breathe. The identity changes with the music while keeping its own voice.',
    angle: 'Walk around a room of suspended posters. At one listening point the scattered words line up; a step to either side reveals a new arrangement and a different part of the recording.',
  },
  {
    no: '02', name: 'SOFT SIGNAL', type: 'Digital / Play', mark: 'island',
    text: 'A tiny digital garden with nothing to finish. Touch, light, and time replace the usual demands for attention.',
    short: 'A slower kind of screen.',
    concept: 'A small gesture can move a stone, bend a stem, or send a ripple through the space. There are no scores or streaks. The garden remembers visits through subtle changes in its light and growth.',
    angle: 'Stay for ten seconds or ten minutes. Every interaction leaves a gentle trace, giving the next visitor a slightly different place to discover.',
  },
  {
    no: '03', name: 'SIDEWAYS', type: 'Space / Story', mark: 'street',
    text: 'One street, three points of view. A walk-through installation turns a familiar place into a set of overlapping stories.',
    short: 'Same place. New story.',
    concept: 'The pavement, the windows, and the rooftops tell different versions of the same moment. Printed fragments sit at different depths, sharing a space instead of appearing as separate screens.',
    angle: 'Find the marked viewpoints to assemble each story. Between them, the fragments mix, interrupt each other, and expose how the image is made.',
  },
  {
    no: '04', name: 'PAPER PLAY', type: 'Type / Motion', mark: 'fold',
    text: 'Letters take the lead in a little theatre of folds, shadows, and badly behaved punctuation.',
    short: 'Type takes the stage.',
    concept: 'A sentence becomes a paper structure. Each fold hides part of a word, every turn reveals a new meaning, and the empty space becomes as expressive as the letters.',
    angle: 'Follow a short typographic performance built around pauses and surprises. Words stretch, meet, disappear, and return as the paper opens.',
  },
];

export const METHOD = {
  title: 'Less talk. More play.',
  flow: 'Notice → Make → Test → Remix',
  steps: [
    { no: '01', key: 'NOTICE', text: 'Find the small detail everyone else walks past. Ask what it could become.' },
    { no: '02', key: 'MAKE', text: 'Build the smallest version you can touch, move, or walk around.' },
    { no: '03', key: 'TEST', text: 'Watch what people actually do. Follow their surprises, not your assumptions.' },
    { no: '04', key: 'REMIX', text: 'Keep the interesting accident. Change the rest. Try it again.' },
  ],
};

export const INDEX_VIEW = {
  title: 'There is always another angle.',
  flow: ['One space', 'Five perspectives', 'Keep exploring'],
  chapters: [
    { key: 'START', text: 'Meet OFF/ANGLE' },
    { key: 'STORY', text: 'Why we make' },
    { key: 'WORK', text: 'Four experiments' },
    { key: 'PLAY', text: 'How we work' },
  ],
};

/* ------------------------------------------------------------------ *
 * 五个方向的母图
 * ------------------------------------------------------------------ */

export const VIEWS = [
  {
    id:'home',label:'Start',plane:'home',W:2048,H:990,
    draw(ctx){
      this.hotspots=[];
      const homeInk = '#1D1D1D';
      ctx.fillStyle=PAPER;ctx.fillRect(0,0,this.W,this.H);
      paintSolids(ctx,'home',this.W,this.H);
      caption(ctx,'INDEPENDENT BY DESIGN',116,244,22,PAPER);
      caption(ctx,'A studio for the unexpected.',116,288,23,PAPER);
      headline(ctx,'Off',108,625,420,{tracking:-0.012,color:PAPER,italic:true,maxWidth:400});
      headline(ctx,'Angle',690,686,250,{tracking:-0.030,color:homeInk,family:SANS,weight:800,maxWidth:590});
      caption(ctx,'A different point of view.',706,782,29,homeInk);
      DIRECTIONS.forEach((d,i)=>caption(ctx,`${['01','02','03'][i]}   ${d}`,136,759+i*61,23,PAPER));
      caption(ctx,'EXPERIMENTS IN',1510,607,20,homeInk);
      headline(ctx,'Other',1510,702,115,{tracking:-0.012,color:homeInk,maxWidth:370});
      headline(ctx,'ways.',1510,790,115,{tracking:-0.012,color:homeInk,italic:true,maxWidth:370});
      caption(ctx,'To see. To think. To play.',1514,828,20,homeInk);
      [['Explore work ↗','works',700],['Our story ↗','about',1035]].forEach(([t,id,x])=>{
        headline(ctx,t,x,942,28,{color:homeInk,family:SANS,weight:700,maxWidth:285});
        pushHotspot(this,x-10,899,276,75,{type:'goto',id},t);
      });
    },
  },
  {
    id:'about',label:'Story',plane:'about',W:2400,H:1160,
    draw(ctx){
      this.hotspots=[];
      const X=u=>(u+6)*200,Y=v=>(3.2-v)*200;
      ctx.fillStyle=PAPER;ctx.fillRect(0,0,this.W,this.H);
      ctx.fillStyle=PALETTE.sand;ctx.beginPath();ctx.arc(X(1.3),Y(-.05),430,0,Math.PI*2);ctx.fill();
      caption(ctx,'02 / CURIOUS BY DESIGN',X(1.3),Y(1.35),25);
      headline(ctx,'Stay',X(-1.35),Y(.25),240,{tracking:-0.030,family:SANS,weight:800,maxWidth:590});
      headline(ctx,'curious.',X(-.95),Y(-.87),285,{tracking:-0.020,italic:true,maxWidth:685});
      caption(ctx,'Small observations. Unexpected encounters.',X(-1.25),Y(-1.65),25);
      headline(ctx,'A different',X(-3.5),Y(-1.05),47,{family:SANS,weight:700,maxWidth:360});
      headline(ctx,'point of view.',X(-3.5),Y(-1.4),47,{family:SANS,weight:700,maxWidth:360});
      caption(ctx,'IDENTITY × INTERACTION × SPACE',X(-1.25),Y(-1.95),20,PALETTE.ink);
    },
  },
  {
    id:'works',label:'Projects',plane:'works',W:2400,H:1160,
    draw(ctx){
      this.hotspots=[];
      const X=u=>(u+6)*200,Y=v=>(3.2-v)*200;
      ctx.fillStyle=PAPER;ctx.fillRect(0,0,this.W,this.H);
      ctx.fillStyle=INK;ctx.beginPath();ctx.roundRect(X(-3.65),Y(.25),1400,450,[120,0,90,0]);ctx.fill();
      caption(ctx,'SELECTED EXPERIMENTS / 01—04',X(-.85),Y(.9),26,PALETTE.vermilion);
      headline(ctx,'In practice.',X(-2.15),Y(-.76),230,{tracking:-0.016,color:PALETTE.sand,italic:true,maxWidth:1000});
      const xs=[-2.85,-1.35,.15,1.65],ys=[-1.23,-1.43,-1.23,-1.43];
      PROJECTS.forEach((p,i)=>{
        const x=X(xs[i]),y=Y(ys[i]);
        caption(ctx,`${p.no} / ${p.type}`,x,y-38,19,PALETTE.sand);
        headline(ctx,p.name,x,y+20,40,{color:PAPER,family:SANS,weight:700,maxWidth:280});
        caption(ctx,['An identity with a pulse.','A slower kind of screen.','Same place. New story.','Type takes the stage.'][i],x,y+78,19,PAPER);
        pushHotspot(this,x-10,y-66,290,165,{type:'project',no:p.no},p.name);
      });
    },
  },
  {
    id:'method',label:'Process',plane:'method',W:2400,H:1800,
    draw(ctx){
      this.hotspots=[];
      const X=u=>(u+6)*200,Y=v=>(4-v)*200;
      ctx.fillStyle=PAPER;ctx.fillRect(0,0,this.W,this.H);
      ctx.fillStyle=PALETTE.cobalt;ctx.beginPath();ctx.arc(X(.9),Y(.2),620,0,Math.PI*2);ctx.fill();
      const hollow=()=>{ctx.beginPath();ctx.arc(X(2.7),Y(1.8),500,0,Math.PI*2);};
      ctx.fillStyle=PAPER;hollow();ctx.fill();
      const cutTitle=(text,x,y,size,opts={})=>{
        headline(ctx,text,x,y,size,{...opts,color:PAPER});
        ctx.save();hollow();ctx.clip();headline(ctx,text,x,y,size,{...opts,color:INK});ctx.restore();
      };
      caption(ctx,'04 / JUST MAKE.',X(-1.3),Y(1.9),25,PAPER);
      cutTitle('Think in play.',X(-2),Y(0),245,{italic:true,maxWidth:940});
      caption(ctx,'Good things begin with an experiment.',X(-1.5),Y(-.65),24,PAPER);
      const pos=[[-3.2,-2.0,INK],[-.8,-1.85,PAPER],[1,-1.85,PAPER],[-2.6,-3.25,INK]];
      METHOD.steps.forEach((st,i)=>{
        const [u,v,color]=pos[i],x=X(u),y=Y(v);
        headline(ctx,st.no,x,y-72,64,{color:color===PAPER?PAPER:PALETTE.vermilion,italic:true});
        headline(ctx,st.key,x,y,46,{color,family:SANS,weight:700,maxWidth:290});
        caption(ctx,['Look a little closer.','Build something small.','Follow the surprise.','Keep the good bits.'][i],x,y+62,22,color);
      });
    },
  },
  {
    id:'index',label:'Index',plane:'index',W:1664,H:1387,
    draw(ctx){
      this.hotspots=[];
      ctx.fillStyle=PAPER;ctx.fillRect(0,0,this.W,this.H);
      paintSolids(ctx,'index',this.W,this.H);
      ctx.save();ctx.textAlign='center';ctx.textBaseline='alphabetic';
      setFont(ctx,22,500,SANS);ctx.fillStyle=INK;ctx.fillText('05 / CHOOSE YOUR ANGLE',957,990);ctx.restore();
      headline(ctx,'Look again ↗',957,1080,82,{tracking:-0.010,italic:true,align:'center',maxWidth:400});
      const spots=[[392,244],[650,210],[406,410],[600,320]];
      INDEX_VIEW.chapters.forEach((c,i)=>{
        const [x,y]=spots[i];
        caption(ctx,`0${i+1}`,x,y-49,22,PAPER);
        headline(ctx,`${c.key} ↗`,x,y,36,{color:PAPER,family:SANS,weight:600,maxWidth:182});
        caption(ctx,c.text,x,y+32,18,PAPER);
        pushHotspot(this,x-8,y-52,185,98,{type:'goto',id:chapterId(i)},c.key);
      });
    },
  },
];

function chapterId(i) {
  return ['home', 'about', 'works', 'method'][i] ?? 'home';
}

export const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v]));

/* ------------------------------------------------------------------ *
 * 母图 → 贴图
 * ------------------------------------------------------------------ */

/**
 * 只有底色、没有字的画布（PAPER + paintSolids）。
 * 遮罩膨胀时用它判断「源 texel 与目标 texel 是否同一底色」——
 * 绝不能用含字母的图判断，否则会把字笔画误当成色界。
 */
export function makeColorOnlyCanvas(view, N) {
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const cx = cv.getContext('2d');
  cx.fillStyle = PAPER; cx.fillRect(0, 0, N, N);
  paintSolids(cx, view.plane, N, N);
  return cv;
}

export function makeMasterTexture(view, THREE, mask = null, renderer = null) {
  const canvas = document.createElement('canvas');
  // More texels without changing design coordinates or the permanent UVs.
  // Bound memory and texture size; retain mipmaps for stable oblique views.
  const maxSide=Math.min(4096,renderer?.capabilities.maxTextureSize??4096);
  const maxPixels=matchMedia('(pointer: coarse)').matches?4_000_000:8_000_000;
  const scale=Math.min(2,maxSide/view.W,maxSide/view.H,Math.sqrt(maxPixels/(view.W*view.H)));
  canvas.width = Math.round(view.W*scale);
  canvas.height = Math.round(view.H*scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(canvas.width/view.W,0,0,canvas.height/view.H,0,0);
  view.draw.call(view, ctx);
  // 静态可见遮罩：只保留该实体在**基准方向确实最靠前**的那部分 UV。
  // 初始化时算一次、烘进贴图，不随相机变化，也不会把整块实体复制一份。
  if (mask) {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0, view.W, view.H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(16,renderer?.capabilities.getMaxAnisotropy()??8);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  displayReady.then(()=>{
    ctx.clearRect(0,0,view.W,view.H);
    view.draw.call(view,ctx);
    if(mask){ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,view.W,view.H);ctx.globalCompositeOperation='source-over';}
    texture.needsUpdate=true;
  });

  return { canvas, texture };
}

/** 抽屉 / 手机端复用的纯文本正文（与母图同源） */
export function viewText(viewId) {
  switch (viewId) {
    case 'home':
      return {
        kicker: `${BRAND.name} / ${BRAND.studio}`, title: TAGLINE, body: INTRO,
        list: DIRECTIONS.map((d) => ({ key: d, text: '' })),
        closing: 'Drag to turn the sculpture. Find another point of view.',
      };
    case 'about':
      return { kicker: '02 / STORY', title: ABOUT.title, body: ABOUT.body, list: ABOUT.items, closing: ABOUT.closing };
    case 'works':
      return { kicker: '03 / PROJECTS', title: 'Ideas, in practice.', list: PROJECTS };
    case 'method':
      return { kicker: '04 / PROCESS', title: METHOD.title, list: METHOD.steps, closing: METHOD.flow };
    default:
      return { kicker: '05 / INDEX', title: INDEX_VIEW.title, body: INDEX_VIEW.flow.join(' → '), list: INDEX_VIEW.chapters };
  }
}
