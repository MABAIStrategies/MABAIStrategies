// Procedurally painted tile faces (no image assets). Each face is a canvas texture.
import * as THREE from 'three';

export const FACE_W = 240, FACE_H = 320;
const CJK = '"Noto Serif SC", "Songti SC", "SimSun", "MS Mincho", serif';
const NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WINDS = ['東', '南', '西', '北'];
const FLOWERS = ['梅', '蘭', '菊', '竹'];
const SEASONS = ['春', '夏', '秋', '冬'];

const BLUE = '#1f4e9e', GREEN = '#1b7a45', RED = '#c0392b', INK = '#1d2340';

export function faceName(face: number): string {
  if (face < 9) return `${face + 1} of Dots`;
  if (face < 18) return `${face - 8} of Bamboo`;
  if (face < 27) return `${face - 17} of Characters`;
  if (face < 31) return ['East', 'South', 'West', 'North'][face - 27] + ' Wind';
  if (face < 34) return ['Red', 'Green', 'White'][face - 31] + ' Dragon';
  if (face < 38) return ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'][face - 34] + ' Flower';
  return ['Spring', 'Summer', 'Autumn', 'Winter'][face - 38] + ' Season';
}

function label(face: number): [string, string] {
  if (face < 9) return [`${face + 1}`, BLUE];
  if (face < 18) return [`${face - 8}`, GREEN];
  if (face < 27) return [`${face - 17}`, RED];
  if (face < 31) return [['E', 'S', 'W', 'N'][face - 27], INK];
  if (face < 34) return [['R', 'G', 'Wh'][face - 31], [RED, GREEN, BLUE][face - 31]];
  if (face < 38) return [`F${face - 33}`, '#a0306a'];
  return [`S${face - 37}`, '#a05a10'];
}

const DOT_LAYOUTS: [number, number][][] = [
  [[0.5, 0.5]],
  [[0.5, 0.28], [0.5, 0.72]],
  [[0.27, 0.22], [0.5, 0.5], [0.73, 0.78]],
  [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]],
  [[0.27, 0.25], [0.73, 0.25], [0.5, 0.5], [0.27, 0.75], [0.73, 0.75]],
  [[0.32, 0.22], [0.68, 0.22], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]],
  [[0.25, 0.16], [0.5, 0.26], [0.75, 0.36], [0.32, 0.6], [0.68, 0.6], [0.32, 0.84], [0.68, 0.84]],
  [[0.32, 0.14], [0.68, 0.14], [0.32, 0.38], [0.68, 0.38], [0.32, 0.62], [0.68, 0.62], [0.32, 0.86], [0.68, 0.86]],
  [[0.22, 0.2], [0.5, 0.2], [0.78, 0.2], [0.22, 0.5], [0.5, 0.5], [0.78, 0.5], [0.22, 0.8], [0.5, 0.8], [0.78, 0.8]],
];
const DOT_COLORS: string[][] = [
  [RED], [GREEN, BLUE], [BLUE, RED, GREEN], [BLUE, GREEN, GREEN, BLUE], [BLUE, GREEN, RED, GREEN, BLUE],
  [GREEN, GREEN, RED, RED, RED, RED], [GREEN, GREEN, GREEN, RED, RED, RED, RED],
  Array(8).fill(BLUE), [GREEN, GREEN, GREEN, RED, RED, RED, BLUE, BLUE, BLUE],
];

function drawBase(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
  g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#f1e6cf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FACE_W, FACE_H);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = r * 0.08;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45);
    ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); ctx.stroke();
  }
}

function stick(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  const w = 20;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x - 3, y - h / 2 + 6, 4, h - 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - w / 2, y - 3, w, 6);
}

function bird(ctx: CanvasRenderingContext2D) {
  const cx = FACE_W / 2, cy = FACE_H / 2;
  ctx.fillStyle = GREEN;
  ctx.beginPath(); ctx.ellipse(cx, cy + 10, 46, 62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = RED;
  ctx.beginPath(); ctx.arc(cx, cy - 64, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e2a028';
  ctx.beginPath(); ctx.moveTo(cx + 24, cy - 66); ctx.lineTo(cx + 50, cy - 58); ctx.lineTo(cx + 24, cy - 52); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 9, cy - 70, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx + 10, cy - 70, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = BLUE; ctx.lineWidth = 7;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath(); ctx.moveTo(cx, cy + 50);
    ctx.quadraticCurveTo(cx + k * 30, cy + 90, cx + k * 34, cy + 118); ctx.stroke();
  }
  ctx.fillStyle = '#e8c35a';
  ctx.beginPath(); ctx.ellipse(cx - 6, cy + 14, 20, 34, -0.3, 0, Math.PI * 2); ctx.fill();
}

function glyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `900 ${size}px ${CJK}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}

function blossom(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, petal: string, core: string) {
  ctx.fillStyle = petal;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
}

export function paintFace(ctx: CanvasRenderingContext2D, face: number, showLabel: boolean) {
  drawBase(ctx);
  const W = FACE_W, H = FACE_H;
  if (face < 9) {
    const n = face;
    const r = n === 0 ? 70 : n < 4 ? 38 : n < 6 ? 32 : 26;
    DOT_LAYOUTS[n].forEach(([u, v], i) => dot(ctx, 20 + u * (W - 40), 24 + v * (H - 48), r, DOT_COLORS[n][i]));
  } else if (face < 18) {
    const n = face - 9;
    if (n === 0) bird(ctx);
    else {
      const pts = DOT_LAYOUTS[n];
      const h = n < 4 ? 88 : n < 6 ? 72 : n < 8 ? 58 : 56;
      pts.forEach(([u, v], i) => stick(ctx, 22 + u * (W - 44), 28 + v * (H - 56), h, (n === 8 && i % 3 === 1) || (n === 4 && i === 2) || (n === 6 && i === 0) ? RED : (i % 2 && n > 6 ? BLUE : GREEN)));
    }
  } else if (face < 27) {
    glyph(ctx, NUMS[face - 18], W / 2, H * 0.3, 104, INK);
    glyph(ctx, '萬', W / 2, H * 0.72, 120, RED);
  } else if (face < 31) {
    glyph(ctx, WINDS[face - 27], W / 2, H / 2 + 6, 170, INK);
  } else if (face === 31) {
    glyph(ctx, '中', W / 2, H / 2 + 6, 190, RED);
  } else if (face === 32) {
    glyph(ctx, '發', W / 2, H / 2 + 6, 170, GREEN);
  } else if (face === 33) {
    ctx.strokeStyle = BLUE; ctx.lineWidth = 12;
    ctx.strokeRect(36, 40, W - 72, H - 80);
    ctx.lineWidth = 5; ctx.strokeRect(58, 62, W - 116, H - 124);
  } else if (face < 38) {
    const k = face - 34;
    const cols = [['#e8789a', '#ffd34d'], ['#9b6bd6', '#ffe9a8'], ['#f0a020', '#8a4b08'], ['#3e9b5a', '#d8f0c8']][k];
    blossom(ctx, W * 0.5, H * 0.3, 26, cols[0], cols[1]);
    glyph(ctx, FLOWERS[k], W / 2, H * 0.7, 108, '#7b1f4a');
  } else {
    const k = face - 38;
    const sym = ['#f48fb1', '#ff9f1c', '#d35400', '#5dade2'][k];
    ctx.fillStyle = sym;
    ctx.beginPath(); ctx.arc(W * 0.5, H * 0.28, 36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(W * 0.5 - 10, H * 0.28 - 10, 12, 0, Math.PI * 2); ctx.fill();
    glyph(ctx, SEASONS[k], W / 2, H * 0.7, 108, '#6e3b00');
  }
  if (showLabel) {
    const [t, c] = label(face);
    ctx.font = '800 34px "Nunito", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,250,240,0.85)';
    const w = ctx.measureText(t).width;
    ctx.fillRect(4, 4, w + 14, 38);
    ctx.fillStyle = c; ctx.fillText(t, 11, 6);
  }
}

export function paintBack(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, FACE_W, FACE_H);
  g.addColorStop(0, '#2f8f6a'); g.addColorStop(1, '#16573f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, FACE_W, FACE_H);
  ctx.strokeStyle = 'rgba(220,255,235,0.45)'; ctx.lineWidth = 5;
  for (let k = 0; k < 5; k++) {
    const cx = 40 + (k % 3) * 80, cy = 60 + Math.floor(k / 2) * 90;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 3.2; a += 0.1) {
      const r = 4 + a * 7;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  glyph(ctx, '?', FACE_W / 2, FACE_H / 2 + 6, 120, 'rgba(230,255,240,0.55)');
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = FACE_W; c.height = FACE_H;
  return [c, c.getContext('2d')!];
}

export class FaceAtlas {
  textures: THREE.CanvasTexture[] = [];
  back!: THREE.CanvasTexture;
  private urls = new Map<number, string>();
  constructor(public showLabels: boolean, private anisotropy: number) { this.build(); }

  build() {
    this.textures.forEach(t => t.dispose());
    this.textures = [];
    this.urls.clear();
    for (let f = 0; f < 42; f++) {
      const [c, ctx] = makeCanvas();
      paintFace(ctx, f, this.showLabels);
      this.textures.push(this.tex(c));
    }
    const [c, ctx] = makeCanvas();
    paintBack(ctx);
    this.back = this.tex(c);
  }

  private tex(c: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    return t;
  }

  dataUrl(face: number): string {
    let u = this.urls.get(face);
    if (!u) {
      const [c, ctx] = makeCanvas();
      paintFace(ctx, face, this.showLabels);
      u = c.toDataURL('image/png');
      this.urls.set(face, u);
    }
    return u;
  }
}

export async function waitForFonts(timeoutMs = 2500) {
  if (!('fonts' in document)) return;
  const loads = Promise.all([
    document.fonts.load(`900 64px "Noto Serif SC"`, '一東中發萬'),
    document.fonts.load(`700 32px "Cinzel"`),
    document.fonts.load(`800 32px "Nunito"`),
  ]).catch(() => undefined);
  await Promise.race([loads, new Promise(r => setTimeout(r, timeoutMs))]);
}
