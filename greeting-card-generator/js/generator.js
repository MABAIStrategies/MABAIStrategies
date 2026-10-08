// generator.js — Procedural 9:16 greeting-card renderer.
// Given a card "config" (occasion, theme, palette, seed, vibe, effects) it
// paints a full card onto a canvas. Deterministic: same config => same art,
// which is what makes Remix reproducible and shareable.

import { OCCASION_MAP, THEME_MAP, PALETTE_MAP, THEMES, PALETTES, EFFECT_KEYWORDS } from './data.js';

export const CARD_W = 720;
export const CARD_H = 1280; // 9:16

// ---- Seeded RNG (mulberry32) -------------------------------------------------
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- Vibe parsing ------------------------------------------------------------
// Turn a free-text vibe into a theme suggestion, effect toggles, and mood flags.
export function parseVibe(vibe) {
  const text = (vibe || '').toLowerCase();
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (list) => list.some(k => text.includes(k));

  let theme = null;
  let bestScore = 0;
  for (const t of THEMES) {
    const score = t.keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; theme = t.id; }
  }

  const effects = {};
  for (const [fx, keys] of Object.entries(EFFECT_KEYWORDS)) effects[fx] = has(keys);

  return {
    theme,
    effects,
    dark: has(['dark','noir','night','moody','midnight','shadow']),
    bright: has(['bright','vivid','vibrant','pop','bold','sunny']),
    words,
  };
}

// Pick a palette whose feel matches the vibe, else null (caller may randomize).
export function suggestPalette(vibe) {
  const v = parseVibe(vibe);
  const t = (vibe || '').toLowerCase();
  const table = {
    'neon-noir': ['cyber','neon','noir','dark','glitch','matrix'],
    'rainy-dusk': ['rain','lofi','lo-fi','chill','calm','dusk','blue'],
    'sunset-pop': ['sunset','vapor','miami','warm','pink','80s'],
    'sage-cream': ['sage','earthy','natural','calm','minimal','green'],
    'blush-rose': ['romantic','valentine','love','soft','rose','pink'],
    'midnight-gold': ['luxury','gold','deco','elegant','gatsby','formal'],
    'mint-berry': ['fresh','fun','playful','summer'],
    'cotton-candy': ['dreamy','pastel','cute','soft','candy'],
    'ember': ['fire','warm','ember','autumn','cozy','orange'],
    'ocean-glass': ['ocean','water','sea','aqua','cool','fresh'],
    'forest-fog': ['forest','nature','botanical','fog','earthy','green'],
    'grape-soda': ['cosmic','space','galaxy','purple','vibrant'],
  };
  let best = null, score = 0;
  for (const p of PALETTES) {
    const s = (table[p.id] || []).reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0);
    if (s > score) { score = s; best = p.id; }
  }
  return best;
}

// ---- Small canvas helpers ----------------------------------------------------
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function rgba(hex, a) { const { r,g,b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function lerp(a, b, t) { return a + (b - a) * t; }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

const FONT_STACKS = {
  mono:    "'Courier New', ui-monospace, monospace",
  round:   "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
  sans:    "'Helvetica Neue', Arial, system-ui, sans-serif",
  serif:   "'Georgia', 'Times New Roman', serif",
  display: "'Georgia', 'Palatino Linotype', serif",
};

// ---- Backgrounds -------------------------------------------------------------
function drawBackground(ctx, cfg, rng) {
  const [deep, mid, light, accent, glow] = cfg.colors;
  const style = THEME_MAP[cfg.theme]?.bg || 'flat';
  ctx.save();

  if (style === 'flat') {
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    // soft corner tint
    const rg = ctx.createRadialGradient(CARD_W*0.8, CARD_H*0.15, 40, CARD_W*0.8, CARD_H*0.15, CARD_H*0.9);
    rg.addColorStop(0, rgba(accent, 0.18));
    rg.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = rg; ctx.fillRect(0,0,CARD_W,CARD_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, CARD_W * (0.3 + rng()*0.7), CARD_H);
    if (style === 'neon' || style === 'space') {
      g.addColorStop(0, deep); g.addColorStop(0.55, mid); g.addColorStop(1, deep);
    } else if (style === 'dusk') {
      g.addColorStop(0, deep); g.addColorStop(0.6, mid); g.addColorStop(1, light);
    } else if (style === 'gold') {
      g.addColorStop(0, deep); g.addColorStop(1, mid);
    } else { // wash / grain
      g.addColorStop(0, light); g.addColorStop(1, mid);
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // Ambient glow orb for depth
  if (style === 'neon' || style === 'space' || style === 'dusk') {
    const gx = lerp(CARD_W*0.2, CARD_W*0.8, rng());
    const gy = lerp(CARD_H*0.15, CARD_H*0.45, rng());
    const rg = ctx.createRadialGradient(gx, gy, 10, gx, gy, CARD_W*0.9);
    rg.addColorStop(0, rgba(glow, 0.35));
    rg.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = rg; ctx.fillRect(0,0,CARD_W,CARD_H);
  }
  ctx.restore();
}

// ---- Motifs ------------------------------------------------------------------
function drawMotif(ctx, cfg, rng) {
  const [deep, mid, light, accent, glow] = cfg.colors;
  const motif = THEME_MAP[cfg.theme]?.motif || 'line';
  ctx.save();

  switch (motif) {
    case 'grid': { // perspective neon grid + horizon
      const hy = CARD_H * 0.62;
      ctx.strokeStyle = rgba(accent, 0.5); ctx.lineWidth = 2;
      for (let i = -10; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(CARD_W/2 + i*30, hy);
        ctx.lineTo(CARD_W/2 + i*220, CARD_H);
        ctx.stroke();
      }
      for (let j = 0; j < 14; j++) {
        const t = j/14, y = hy + (CARD_H-hy) * (t*t);
        ctx.strokeStyle = rgba(glow, 0.3 + t*0.4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CARD_W, y); ctx.stroke();
      }
      // sun
      const sr = CARD_W*0.28, sx = CARD_W/2, sy = hy - sr*0.6;
      const sg = ctx.createLinearGradient(0, sy-sr, 0, sy+sr);
      sg.addColorStop(0, accent); sg.addColorStop(1, glow);
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'bokeh': { // soft floating light circles
      for (let i = 0; i < 22; i++) {
        const r = 10 + rng()*70;
        const x = rng()*CARD_W, y = rng()*CARD_H*0.9;
        ctx.fillStyle = rgba(pick(rng,[light,accent,glow]), 0.05 + rng()*0.12);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      }
      break;
    }
    case 'line': { // minimalist thin frame + rule
      ctx.strokeStyle = rgba(accent, 0.9); ctx.lineWidth = 3;
      ctx.strokeRect(46, 46, CARD_W-92, CARD_H-92);
      ctx.beginPath(); ctx.moveTo(CARD_W*0.5-70, CARD_H*0.5); ctx.lineTo(CARD_W*0.5+70, CARD_H*0.5); ctx.stroke();
      break;
    }
    case 'blob': { // watercolor blobs
      for (let i = 0; i < 6; i++) {
        const cx = rng()*CARD_W, cy = rng()*CARD_H;
        const base = pick(rng, [mid, accent, glow, light]);
        ctx.fillStyle = rgba(base, 0.16);
        ctx.beginPath();
        const pts = 10, rad = 90 + rng()*160;
        for (let p = 0; p <= pts; p++) {
          const ang = (p/pts)*Math.PI*2;
          const rr = rad * (0.7 + rng()*0.5);
          const x = cx + Math.cos(ang)*rr, y = cy + Math.sin(ang)*rr;
          p === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'sunburst': { // retro rays from top
      const cx = CARD_W/2, cy = CARD_H*0.12, rays = 24;
      for (let i = 0; i < rays; i++) {
        ctx.fillStyle = i % 2 ? rgba(accent, 0.16) : rgba(glow, 0.10);
        ctx.beginPath(); ctx.moveTo(cx, cy);
        const a0 = (i/rays)*Math.PI*2, a1 = ((i+1)/rays)*Math.PI*2;
        ctx.lineTo(cx + Math.cos(a0)*1500, cy + Math.sin(a0)*1500);
        ctx.lineTo(cx + Math.cos(a1)*1500, cy + Math.sin(a1)*1500);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'leaf': { // botanical sprigs in corners
      const drawSprig = (x, y, dir, scale) => {
        ctx.save(); ctx.translate(x, y); ctx.scale(dir*scale, scale);
        ctx.strokeStyle = rgba(mid, 0.9); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(60, -120, 30, -260); ctx.stroke();
        for (let i = 1; i <= 6; i++) {
          const t = i/7, lx = lerp(0,30,t), ly = lerp(0,-260,t);
          ctx.fillStyle = rgba(pick(rng,[accent,glow,light]), 0.85);
          ctx.beginPath(); ctx.ellipse(lx+22, ly, 26, 12, -0.6, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(lx-22, ly, 26, 12, 0.6, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      };
      drawSprig(90, CARD_H-70, 1, 1.1);
      drawSprig(CARD_W-90, CARD_H-70, -1, 1.1);
      drawSprig(80, 320, 1, 0.7);
      break;
    }
    case 'poly': { // scattered geometric shapes
      for (let i = 0; i < 14; i++) {
        const x = rng()*CARD_W, y = rng()*CARD_H, s = 30 + rng()*120;
        ctx.fillStyle = rgba(pick(rng,[deep,mid,accent,glow]), 0.5);
        const kind = Math.floor(rng()*3);
        ctx.beginPath();
        if (kind === 0) ctx.arc(x, y, s/2, 0, Math.PI*2);
        else if (kind === 1) ctx.rect(x, y, s, s);
        else { ctx.moveTo(x, y-s/2); ctx.lineTo(x+s/2, y+s/2); ctx.lineTo(x-s/2, y+s/2); ctx.closePath(); }
        ctx.fill();
      }
      break;
    }
    case 'stars': { // constellation field
      for (let i = 0; i < 160; i++) {
        const x = rng()*CARD_W, y = rng()*CARD_H, r = rng()*1.8;
        ctx.fillStyle = rgba(i % 9 === 0 ? accent : light, 0.4 + rng()*0.6);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      }
      // a few bright cross-stars
      for (let i = 0; i < 5; i++) {
        const x = rng()*CARD_W, y = rng()*CARD_H*0.6;
        drawSparkle(ctx, x, y, 8 + rng()*10, glow);
      }
      break;
    }
    case 'fan': { // art deco fans
      const cx = CARD_W/2;
      const drawFan = (cy, r) => {
        ctx.strokeStyle = rgba(accent, 0.85); ctx.lineWidth = 3;
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI + (i/8)*Math.PI;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r*0.5); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI*2); ctx.stroke();
      };
      drawFan(CARD_H*0.16, 220);
      drawFan(CARD_H*0.86, 220);
      break;
    }
  }
  ctx.restore();
}

function drawSparkle(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y);
  const g = ctx.createRadialGradient(0,0,0,0,0,size);
  g.addColorStop(0, rgba(color, 0.9)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0,0,size,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-size,0); ctx.lineTo(size,0); ctx.moveTo(0,-size); ctx.lineTo(0,size); ctx.stroke();
  ctx.restore();
}

// ---- Atmospheric effects -----------------------------------------------------
function drawEffects(ctx, cfg, rng) {
  const fx = cfg.effects || {};
  const [deep, mid, light, accent, glow] = cfg.colors;

  if (fx.rain) {
    ctx.strokeStyle = rgba(light, 0.35); ctx.lineWidth = 1.5;
    for (let i = 0; i < 160; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H, len = 12 + rng()*26;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x-5, y+len); ctx.stroke();
    }
  }
  if (fx.snow) {
    for (let i = 0; i < 120; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H, r = 1 + rng()*3.5;
      ctx.fillStyle = rgba('#ffffff', 0.5 + rng()*0.4);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
  }
  if (fx.confetti) {
    for (let i = 0; i < 90; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H*0.7, w = 6 + rng()*8;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rng()*Math.PI);
      ctx.fillStyle = pick(rng, [accent, glow, light, mid]);
      ctx.fillRect(-w/2, -w/4, w, w/2); ctx.restore();
    }
  }
  if (fx.stars && THEME_MAP[cfg.theme]?.motif !== 'stars') {
    for (let i = 0; i < 40; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H*0.55;
      ctx.fillStyle = rgba(glow, 0.5 + rng()*0.5);
      ctx.beginPath(); ctx.arc(x, y, rng()*1.6, 0, Math.PI*2); ctx.fill();
    }
  }
  if (fx.scanlines) {
    ctx.fillStyle = rgba('#000000', 0.12);
    for (let y = 0; y < CARD_H; y += 4) ctx.fillRect(0, y, CARD_W, 2);
    // chromatic offset stripe
    ctx.fillStyle = rgba(accent, 0.08);
    ctx.fillRect(0, rng()*CARD_H, CARD_W, 30);
  }
  if (fx.bokeh) {
    for (let i = 0; i < 14; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H, r = 20 + rng()*90;
      ctx.fillStyle = rgba(glow, 0.05 + rng()*0.08);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
  }
  if (fx.grain) {
    const density = 2600;
    for (let i = 0; i < density; i++) {
      const x = rng()*CARD_W, y = rng()*CARD_H;
      ctx.fillStyle = rgba(rng() > 0.5 ? '#ffffff' : '#000000', 0.03 + rng()*0.04);
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
}

// ---- Typography --------------------------------------------------------------
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(ctx, cfg) {
  const occ = OCCASION_MAP[cfg.occasion];
  const [deep, mid, light, accent, glow] = cfg.colors;
  const fontKey = THEME_MAP[cfg.theme]?.font || 'sans';
  const stack = FONT_STACKS[fontKey];
  const dark = ['neon','space','dusk','gold'].includes(THEME_MAP[cfg.theme]?.bg);
  const textColor = dark ? '#ffffff' : deep;
  // On dark grounds colors[2] can itself be a mid/dark tone, so force a light
  // subtitle for guaranteed contrast; on light grounds use the mid tone.
  const subColor = dark ? 'rgba(255,255,255,0.82)' : rgba(mid, 0.95);

  ctx.save();
  ctx.textAlign = 'center';

  // Headline
  const headline = (cfg.headline || occ?.headline || 'Hello').toUpperCase();
  let size = 92;
  ctx.font = `700 ${size}px ${stack}`;
  let lines = wrapText(ctx, headline, CARD_W - 140);
  while (lines.length > 2 && size > 52) { size -= 8; ctx.font = `700 ${size}px ${stack}`; lines = wrapText(ctx, headline, CARD_W - 140); }

  const cy = CARD_H * 0.5;
  const lineH = size * 1.06;
  let y = cy - (lines.length - 1) * lineH / 2;

  // accent glow behind headline for dark themes
  if (dark) { ctx.shadowColor = rgba(glow, 0.9); ctx.shadowBlur = 26; }
  ctx.fillStyle = textColor;
  for (const l of lines) { ctx.fillText(l, CARD_W/2, y); y += lineH; }
  ctx.shadowBlur = 0;

  // small accent rule
  ctx.strokeStyle = accent; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(CARD_W/2 - 60, y + 10); ctx.lineTo(CARD_W/2 + 60, y + 10); ctx.stroke();

  // Subtitle
  const sub = cfg.sub != null ? cfg.sub : (occ?.sub || '');
  if (sub) {
    ctx.font = `400 34px ${stack}`;
    ctx.fillStyle = subColor;
    const subLines = wrapText(ctx, sub, CARD_W - 180);
    let sy = y + 62;
    for (const l of subLines) { ctx.fillText(l, CARD_W/2, sy); sy += 44; }
  }

  // Occasion emblem near top
  if (occ?.emoji) {
    ctx.font = `${72}px ${stack}`;
    ctx.fillStyle = textColor;
    ctx.fillText(occ.emoji, CARD_W/2, CARD_H * 0.22);
  }
  ctx.restore();
}

// Subtle vignette to seat the composition
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(CARD_W/2, CARD_H/2, CARD_H*0.35, CARD_W/2, CARD_H/2, CARD_H*0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CARD_W, CARD_H);
}

// ---- Public API --------------------------------------------------------------
// Render a card config to a given canvas element (sized to CARD_W x CARD_H).
export function renderCard(canvas, cfg) {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(cfg.seed);
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  drawBackground(ctx, cfg, rng);
  drawMotif(ctx, cfg, rng);
  drawEffects(ctx, cfg, rng);
  drawVignette(ctx);
  drawText(ctx, cfg);
  return canvas;
}

// Build a fresh config from user inputs. `reference` (a prior card cfg) seeds
// Remix: we keep its DNA and mutate the seed + nudge palette/effects.
export function buildConfig({ vibe, occasion, theme, palette, seed, reference }) {
  const v = parseVibe(vibe);
  let chosenTheme = theme || v.theme || reference?.theme || pick(makeRng(seed || 1), THEMES).id;
  let chosenPalette = palette || suggestPalette(vibe) || reference?.paletteId;
  if (!chosenPalette) {
    const rng = makeRng((seed || 1) ^ 0x9e3779b9);
    chosenPalette = pick(rng, PALETTES).id;
  }
  const pal = PALETTE_MAP[chosenPalette] || PALETTES[0];
  const occ = OCCASION_MAP[occasion] || OCCASION_MAP[reference?.occasion] || OCCASION_MAP.justbecause;

  // Effects: union of vibe-derived and any inherited from the reference.
  const effects = { ...(reference?.effects || {}) };
  for (const [k, val] of Object.entries(v.effects)) if (val) effects[k] = true;

  return {
    occasion: occ.id,
    theme: chosenTheme,
    paletteId: chosenPalette,
    colors: pal.colors.slice(),
    seed: (seed >>> 0) || 1,
    vibe: vibe || '',
    effects,
    headline: reference?.headline || occ.headline,
    sub: reference?.sub != null ? reference.sub : occ.sub,
  };
}

// Produce N variation configs for one generation request.
export function generateBatch({ vibe, occasion, theme, palette, reference, count = 4 }) {
  const baseSeed = reference
    ? (reference.seed ^ hashString((vibe || '') + Date.now()))
    : hashString((vibe || 'card') + '|' + (occasion || '') + '|' + Date.now());
  const rng = makeRng(baseSeed >>> 0);
  const cfgs = [];
  for (let i = 0; i < count; i++) {
    const seed = (Math.floor(rng() * 0xffffffff)) >>> 0;
    // Vary theme/palette slightly across variations unless the user pinned them.
    let vTheme = theme, vPalette = palette;
    if (!theme && i > 0 && rng() > 0.55) vTheme = pick(rng, THEMES).id;
    if (!palette && i > 0 && rng() > 0.5) vPalette = pick(rng, PALETTES).id;
    cfgs.push(buildConfig({ vibe, occasion, theme: vTheme, palette: vPalette, seed, reference }));
  }
  return cfgs;
}
