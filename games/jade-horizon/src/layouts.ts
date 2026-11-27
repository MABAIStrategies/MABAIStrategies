// Board layouts. Each ASCII '#' is a tile; one column/row = 2 half-units.
// Layers can be offset by half a tile (dx/dy = 1) for classic overlaps.
import type { Pos } from './engine';

interface Layer { z: number; dx?: number; dy?: number; rows: string[] }
export interface Layout { id: string; name: string; desc: string; positions: Pos[] }

function fromLayers(layers: Layer[], extra: Pos[] = []): Pos[] {
  const out: Pos[] = [];
  for (const L of layers) {
    L.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '#') continue;
        out.push({ x: (L.dx ?? 0) + c * 2, y: (L.dy ?? 0) + r * 2, z: L.z });
      }
    });
  }
  out.push(...extra);
  return normalize(out);
}

/** Drop unsupported tiles, enforce an even count, and shift to origin. */
function normalize(list: Pos[]): Pos[] {
  const key = (p: Pos) => `${p.x},${p.y},${p.z}`;
  const seen = new Set<string>();
  let pos = list.filter(p => { const k = key(p); if (seen.has(k)) return false; seen.add(k); return true; });
  pos.sort((a, b) => a.z - b.z);
  const kept: Pos[] = [];
  for (const p of pos) {
    if (p.z === 0 || kept.some(q => q.z === p.z - 1 && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2)) kept.push(p);
  }
  pos = kept;
  if (pos.length % 2 === 1) {
    // remove the highest tile that has nothing on top of it
    const sorted = [...pos].sort((a, b) => b.z - a.z || b.y - a.y || b.x - a.x);
    const victim = sorted.find(p => !pos.some(q => q.z === p.z + 1 && Math.abs(q.x - p.x) < 2 && Math.abs(q.y - p.y) < 2))!;
    pos = pos.filter(p => p !== victim);
  }
  const minX = Math.min(...pos.map(p => p.x)), minY = Math.min(...pos.map(p => p.y));
  return pos.map(p => ({ x: p.x - minX, y: p.y - minY, z: p.z }));
}

function rect(w: number, h: number): string[] { return Array.from({ length: h }, () => '#'.repeat(w)); }

function pyramid(w: number, h: number, levels: number, dyStep = 2): Layer[] {
  const out: Layer[] = [];
  for (let z = 0; z < levels; z++) {
    const ww = w - z * 2, hh = h - z * 2;
    if (ww <= 0 || hh <= 0) break;
    out.push({ z, dx: z * 2, dy: z * dyStep, rows: rect(ww, hh) });
  }
  return out;
}

function turtle(): Pos[] {
  const rows: [number, number][] = [[1, 12], [3, 10], [2, 11], [1, 12], [1, 12], [2, 11], [3, 10], [1, 12]];
  const pos: Pos[] = [];
  rows.forEach(([a, b], r) => { for (let c = a; c <= b; c++) pos.push({ x: c * 2, y: r * 2, z: 0 }); });
  pos.push({ x: 0, y: 7, z: 0 }, { x: 26, y: 7, z: 0 }, { x: 28, y: 7, z: 0 });
  for (let z = 1; z <= 3; z++) {
    const lo = 3 + z, hi = 10 - z, rlo = z, rhi = 7 - z;
    for (let r = rlo; r <= rhi; r++) for (let c = lo; c <= hi; c++) pos.push({ x: c * 2, y: r * 2, z });
  }
  pos.push({ x: 13, y: 7, z: 4 });
  return normalize(pos);
}

const defs: [string, string, string, () => Pos[]][] = [
  ['petal', 'Petal', 'A gentle bloom for first steps.', () => fromLayers([
    { z: 0, rows: ['.##.', '####', '####', '.##.'] },
    { z: 1, dx: 2, dy: 2, rows: ['##', '##'] },
  ])],
  ['garden', 'Garden Square', 'A tidy courtyard of stone.', () => fromLayers([
    { z: 0, rows: rect(5, 4) },
    { z: 1, dx: 1, dy: 1, rows: ['####', '....', '####'] },
  ])],
  ['steps', 'River Steps', 'Stones crossing a quiet stream.', () => fromLayers([
    { z: 0, rows: ['###.....', '#####...', '..######', '....####'] },
    { z: 1, dx: 2, dy: 2, rows: ['###...', '..###.'] },
  ])],
  ['pyramid_s', 'Little Pyramid', 'Three tiers, one summit.', () => fromLayers(pyramid(6, 4, 2, 2).concat([{ z: 2, dx: 5, dy: 3, rows: ['#'] }]))],
  ['crossroads', 'Crossroads', 'Four roads meet at the shrine.', () => fromLayers([
    { z: 0, rows: ['..##..', '..##..', '######', '######', '..##..', '..##..'] },
    { z: 1, dx: 4, dy: 4, rows: ['##', '##'] },
    { z: 2, dx: 5, dy: 5, rows: ['#'] },
  ])],
  ['shrine', 'Hill Shrine', 'Steps to a quiet altar.', () => fromLayers([
    { z: 0, rows: rect(6, 5) },
    { z: 1, dx: 2, dy: 2, rows: rect(4, 3) },
    { z: 2, dx: 4, dy: 4, rows: rect(2, 1) },
  ])],
  ['moon', 'Full Moon', 'A round pool of silver light.', () => fromLayers([
    { z: 0, rows: ['..####..', '.######.', '########', '########', '.######.', '..####..'] },
    { z: 1, dx: 2, dy: 2, rows: ['.####.', '######', '######', '.####.'].map(r => r.slice(1, 5)) },
    { z: 2, dx: 6, dy: 4, rows: ['##', '##'] },
  ])],
  ['terrace', 'Rice Terrace', 'Fields stepping up the hillside.', () => fromLayers(pyramid(6, 6, 3))],
  ['koi', 'Koi', 'A fish leaping the falls.', () => fromLayers([
    { z: 0, rows: ['....#####...##', '..#########.##', '.############.', '..#########.##', '....#####...##'] },
    { z: 1, dy: 2, rows: ['.....###......', '...######.....', '.....###......'] },
    { z: 2, dy: 4, rows: ['.....##.......'] },
  ])],
  ['crane', 'Crane', 'Wings open over the marsh.', () => fromLayers([
    { z: 0, rows: ['#............#', '##..........##', '###...##...###', '.####.##.####.', '..##########..', '....######....', '.....####.....', '......##......'] },
    { z: 1, dy: 6, rows: ['......##......', '....######....', '.....####.....'] },
    { z: 2, dy: 8, rows: ['......##......'] },
  ])],
  ['lantern', 'Lantern', 'Paper glow on a festival night.', () => fromLayers([
    { z: 0, rows: ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..', '...##...'] },
    { z: 1, dx: 4, dy: 2, rows: rect(4, 5) },
    { z: 2, dx: 6, dy: 4, rows: rect(2, 3) },
  ])],
  ['butterfly', 'Butterfly', 'Twin wings, a fragile balance.', () => fromLayers([
    { z: 0, rows: ['###.....###', '####...####', '#####.#####', '###########', '#####.#####', '####...####', '###.....###'] },
    { z: 1, dy: 2, rows: ['.##.....##.', '.###...###.', '....###....', '.###...###.', '.##.....##.'] },
    { z: 2, dy: 4, rows: ['.....#.....', '.....#.....', '.....#.....'] },
  ])],
  ['fortress', 'Fortress', 'Walls within walls.', () => fromLayers([
    { z: 0, rows: ['##########', '##########', '##......##', '##..##..##', '##..##..##', '##......##', '##########', '##########'] },
    { z: 1, rows: ['##......##', '##......##', '..........', '..........', '..........', '..........', '##......##', '##......##'] },
    { z: 1, dx: 9, dy: 7, rows: ['#'] },
    { z: 2, dx: 1, dy: 1, rows: ['#.......#'] },
    { z: 2, dx: 1, dy: 13, rows: ['#.......#'] },
  ])],
  ['pagoda', 'Pagoda', 'Five roofs toward the heavens.', () => fromLayers([
    { z: 0, rows: rect(8, 6) },
    { z: 1, dx: 2, dy: 2, rows: rect(6, 4) },
    { z: 2, dx: 4, dy: 4, rows: rect(4, 2) },
    { z: 3, dx: 6, dy: 5, rows: ['##'] },
    { z: 4, dx: 7, dy: 5, rows: ['#'] },
  ])],
  ['bridge', 'Moon Bridge', 'An arch over silver water.', () => fromLayers([
    { z: 0, rows: ['####........####', '####........####', '################', '################', '####........####', '####........####'] },
    { z: 1, dy: 4, rows: ['....########....', '....########....'] },
    { z: 2, dy: 4, rows: ['......####......', '......####......'] },
    { z: 1, dx: 2, dy: 2, rows: ['##', '##', '##'] },
    { z: 1, dx: 26, dy: 2, rows: ['##', '##', '##'] },
  ])],
  ['dragon', 'Dragon', 'A serpent coiled through the clouds.', () => fromLayers([
    { z: 0, rows: ['#############.', '............##', '.############.', '##............', '.#############'] },
    { z: 1, rows: ['..#########...', '..............', '...########...', '..............', '...#########..'] },
    { z: 2, dy: 8, rows: ['..........##..'] },
  ])],
  ['lotus', 'Lotus', 'Petals folding inward.', () => fromLayers([
    { z: 0, rows: ['...###...', '.#######.', '.#######.', '#########', '#########', '#########', '.#######.', '.#######.', '...###...'] },
    { z: 1, dx: 1, dy: 3, rows: ['..####..', '.######.', '########', '########', '.######.', '..####..'] },
    { z: 2, dx: 5, dy: 5, rows: ['.##.', '####', '####', '.##.'] },
    { z: 3, dx: 7, dy: 7, rows: ['##', '##'] },
    { z: 4, dx: 8, dy: 8, rows: ['#'] },
  ])],
  ['twin', 'Twin Peaks', 'Two summits, one valley.', () => fromLayers([
    { z: 0, rows: rect(12, 6) },
    { z: 1, dx: 2, dy: 2, rows: ['####..####', '####..####', '####..####', '####..####'].map(r => r) },
    { z: 2, dx: 4, dy: 4, rows: ['##....##', '##....##'] },
    { z: 3, dx: 5, dy: 5, rows: ['#......#'].map(r => r.replace(/\./g, '.')) },
  ])],
  ['wall', 'Great Wall', 'Battlements stretching to the horizon.', () => fromLayers([
    { z: 0, rows: rect(18, 3) },
    { z: 1, dy: 2, rows: ['##################'] },
    { z: 2, dy: 2, rows: ['#.#.#.#.#.#.#.#.#.'] },
  ])],
  ['pyramid', 'Great Pyramid', 'Four tiers of patience.', () => fromLayers(pyramid(8, 8, 4))],
  ['arena', 'Arena', 'A ring around a sacred stone.', () => fromLayers([
    { z: 0, rows: ['..########..', '.##########.', '###......###', '##..####..##', '##..####..##', '###......###', '.##########.', '..########..'] },
    { z: 1, rows: ['...######...', '..........', '', '....####....', '....####....', '', '', '...######...'] },
    { z: 2, dx: 9, dy: 7, rows: ['##'] },
  ])],
  ['turtle', 'Turtle', 'The classic 144-tile shell.', turtle],
  ['starfall', 'Starfall', 'A 144-tile constellation.', () => fromLayers([
    { z: 0, rows: rect(10, 8) },
    { z: 1, dx: 2, dy: 2, rows: rect(8, 6) },
    { z: 2, dx: 6, dy: 4, rows: rect(4, 4) },
  ])],
  ['hollow', 'Hollow Throne', 'The Emperor’s seat of emptiness.', () => fromLayers([
    { z: 0, rows: ['############', '############', '###......###', '###......###', '###......###', '###......###', '############', '############'] },
    { z: 1, rows: ['############', '#..........#', '#..........#', '..........', '..........', '#..........#', '#..........#', '############'] },
    { z: 2, dx: 0, rows: ['#..........#', '#..........#', '', '', '', '', '#..........#', '#..........#'] },
    { z: 3, rows: ['#..........#', '', '', '', '', '', '', '#..........#'] },
    { z: 0, dx: 9, dy: 5, rows: ['###', '###'] },
    { z: 1, dx: 10, dy: 6, rows: ['##'] },
  ])],
];

export const LAYOUTS: Layout[] = defs.map(([id, name, desc, f]) => ({ id, name, desc, positions: f() }));
export const LAYOUT_BY_ID: Record<string, Layout> = Object.fromEntries(LAYOUTS.map(l => [l.id, l]));
export function layoutSize(id: string): number { return LAYOUT_BY_ID[id].positions.length; }
