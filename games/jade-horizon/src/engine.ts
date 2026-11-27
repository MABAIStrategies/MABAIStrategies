// Pure game rules: board topology, free-tile logic, solvable dealing, reshuffle, solver.
// No rendering code lives here so it can be unit tested.
import { Rng, shuffle, randInt } from './rng';

export interface Pos { x: number; y: number; z: number }

export interface TileData {
  id: number;
  pos: Pos;
  face: number;   // 0..41 visual face
  group: number;  // matching group (flowers / seasons share a group)
  removed: boolean;
  mist: boolean;  // face hidden while the tile is blocked
  lock: number;   // number of total matches required before it can be picked
  gold: boolean;
  bomb: number;   // moves until detonation, 0 = not a bomb
}

// Faces: 0-8 dots, 9-17 bamboo, 18-26 characters, 27-30 winds, 31-33 dragons,
// 34-37 flowers (group 34), 38-41 seasons (group 35)
export const FACE_COUNT = 42;
export function groupOf(face: number): number {
  if (face >= 34 && face <= 37) return 34;
  if (face >= 38) return 35;
  return face;
}

interface Topology { above: number[][]; left: number[][]; right: number[][] }

export function buildTopology(pos: Pos[]): Topology {
  const n = pos.length;
  const above: number[][] = Array.from({ length: n }, () => []);
  const left: number[][] = Array.from({ length: n }, () => []);
  const right: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const a = pos[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = pos[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dy) >= 2) continue;
      if (b.z === a.z + 1 && Math.abs(dx) < 2) above[i].push(j);
      else if (b.z === a.z) {
        if (dx === -2) left[i].push(j);
        else if (dx === 2) right[i].push(j);
      }
    }
  }
  return { above, left, right };
}

function freeIn(i: number, topo: Topology, gone: boolean[]): boolean {
  for (const j of topo.above[i]) if (!gone[j]) return false;
  let l = true;
  for (const j of topo.left[i]) if (!gone[j]) { l = false; break; }
  if (l) return true;
  for (const j of topo.right[i]) if (!gone[j]) return false;
  return true;
}

export class Board {
  tiles: TileData[];
  topo: Topology;
  matches = 0;

  constructor(tiles: TileData[]) {
    this.tiles = tiles;
    this.topo = buildTopology(tiles.map(t => t.pos));
  }

  private goneArr(): boolean[] { return this.tiles.map(t => t.removed); }

  isFree(id: number): boolean {
    return freeIn(id, this.topo, this.goneArr());
  }

  freeMap(): boolean[] {
    const g = this.goneArr();
    return this.tiles.map((t, i) => !t.removed && freeIn(i, this.topo, g));
  }

  isSelectable(id: number, free?: boolean[]): boolean {
    const t = this.tiles[id];
    if (t.removed) return false;
    if (t.lock > this.matches) return false;
    return free ? free[id] : this.isFree(id);
  }

  canMatch(a: number, b: number): boolean {
    return a !== b && this.tiles[a].group === this.tiles[b].group;
  }

  availableMatches(): [number, number][] {
    const free = this.freeMap();
    const byGroup = new Map<number, number[]>();
    for (const t of this.tiles) {
      if (!this.isSelectable(t.id, free)) continue;
      const arr = byGroup.get(t.group) ?? [];
      arr.push(t.id);
      byGroup.set(t.group, arr);
    }
    const out: [number, number][] = [];
    for (const ids of byGroup.values())
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
    return out;
  }

  remaining(): number { return this.tiles.reduce((n, t) => n + (t.removed ? 0 : 1), 0); }
}

/** Builds a removal order that is guaranteed to be playable (reverse-deal technique). */
export function solvableOrder(pos: Pos[], rng: Rng, present?: boolean[], attempts = 600): [number, number][] | null {
  const topo = buildTopology(pos);
  const ids = pos.map((_, i) => i).filter(i => !present || present[i]);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const gone = pos.map((_, i) => !!present && !present[i]);
    let left = ids.length;
    const order: [number, number][] = [];
    let ok = true;
    while (left > 0) {
      const free: number[] = [];
      for (const i of ids) if (!gone[i] && freeIn(i, topo, gone)) free.push(i);
      if (free.length < 2) { ok = false; break; }
      // Weight high stacks so tall columns don't strand the last pair.
      const w = free.map(i => {
        const p = pos[i];
        let stackBelow = 0;
        for (const j of ids) if (!gone[j] && pos[j].z < p.z && Math.abs(pos[j].x - p.x) < 2 && Math.abs(pos[j].y - p.y) < 2) stackBelow++;
        return (p.z + 1) * (p.z + 1) + stackBelow * 2 + 0.5;
      });
      const a = weightedPick(free, w, rng);
      const fi = free.indexOf(a); free.splice(fi, 1); w.splice(fi, 1);
      const b = weightedPick(free, w, rng);
      gone[a] = true; gone[b] = true; left -= 2;
      order.push([a, b]);
    }
    if (ok) return order;
  }
  return null;
}

function weightedPick(items: number[], w: number[], rng: Rng): number {
  let sum = 0;
  for (const x of w) sum += x;
  let r = rng() * sum;
  for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

export interface DealSpec {
  copies: 2 | 4;
  mist: number;      // fraction of tiles under mist
  locks: number;
  gold: number;      // gold pairs
  bombs: number;     // bomb pairs
  bombMoves: number;
}

type PairFaces = [number, number];

/** Face pairs: copies=2 → every kind appears once as a pair where possible. */
export function buildPairs(count: number, copies: 2 | 4, rng: Rng): PairFaces[] {
  const normal = shuffle(Array.from({ length: 34 }, (_, i) => i), rng);
  const flowerPairs: PairFaces[] = shuffle([[34, 35], [36, 37]] as PairFaces[], rng);
  const seasonPairs: PairFaces[] = shuffle([[38, 39], [40, 41]] as PairFaces[], rng);
  const out: PairFaces[] = [];
  if (copies === 2) {
    let k = 0;
    const special = [...flowerPairs, ...seasonPairs];
    while (out.length < count) {
      if (k < 34) out.push([normal[k], normal[k]]);
      else if (k < 38) out.push(special[k - 34]);
      else { const f = normal[(k - 38) % 34]; out.push([f, f]); }
      k++;
    }
  } else {
    const kinds: (number | 'F' | 'S')[] = [...normal];
    if (count >= 60) { kinds.push('F', 'S'); shuffle(kinds, rng); }
    let k = 0;
    while (out.length < count) {
      const kind = kinds[k % kinds.length];
      if (kind === 'F') { out.push(flowerPairs[0]); if (out.length < count) out.push(flowerPairs[1]); }
      else if (kind === 'S') { out.push(seasonPairs[0]); if (out.length < count) out.push(seasonPairs[1]); }
      else { out.push([kind, kind]); if (out.length < count) out.push([kind, kind]); }
      k++;
    }
  }
  return shuffle(out, rng);
}

export interface Deal { tiles: TileData[]; order: [number, number][] }

export function deal(pos: Pos[], spec: DealSpec, rng: Rng): Deal {
  const order = solvableOrder(pos, rng);
  if (!order) throw new Error('Layout could not be dealt solvably');
  const pairs = buildPairs(order.length, spec.copies, rng);
  const tiles: TileData[] = pos.map((p, id) => ({
    id, pos: p, face: 0, group: 0, removed: false, mist: false, lock: 0, gold: false, bomb: 0,
  }));
  order.forEach(([a, b], i) => {
    const [fa, fb] = pairs[i];
    tiles[a].face = fa; tiles[a].group = groupOf(fa);
    tiles[b].face = fb; tiles[b].group = groupOf(fb);
  });
  const P = order.length;
  // Bombs: pairs early in the guaranteed order, so the countdown is always beatable.
  const bombMoves = Math.max(spec.bombMoves, 4);
  const bombCandidates = shuffle(order.map((_, i) => i).filter(i => i + 1 <= bombMoves - 2 && i >= 1), rng);
  for (let k = 0; k < Math.min(spec.bombs, bombCandidates.length); k++) {
    const [a, b] = order[bombCandidates[k]];
    tiles[a].bomb = bombMoves; tiles[b].bomb = bombMoves;
  }
  // Gold: buried pairs from the back half of the order → players must dig.
  const goldCandidates = shuffle(order.map((_, i) => i).filter(i => i >= Math.floor(P * 0.45)), rng)
    .filter(i => !tiles[order[i][0]].bomb);
  for (let k = 0; k < Math.min(spec.gold, goldCandidates.length); k++) {
    const [a, b] = order[goldCandidates[k]];
    tiles[a].gold = true; tiles[b].gold = true;
  }
  // Locks: a lock value never exceeds the matches made before that pair in the solution.
  const lockCandidates = shuffle(order.map((_, i) => i).filter(i => i >= 3), rng);
  for (let k = 0; k < Math.min(spec.locks, lockCandidates.length); k++) {
    const i = lockCandidates[k];
    const tid = order[i][rng() < 0.5 ? 0 : 1];
    tiles[tid].lock = Math.max(1, Math.min(i - randInt(rng, 0, 2), 4 + randInt(rng, 0, 10)));
  }
  // Mist: hide faces of a fraction of tiles (prefer lower layers).
  const mistIds = shuffle(tiles.map(t => t.id), rng).sort((a, b) => tiles[a].pos.z - tiles[b].pos.z);
  const mistCount = Math.round(tiles.length * spec.mist);
  for (let k = 0; k < mistCount; k++) tiles[mistIds[k]].mist = true;
  return { tiles, order };
}

/** Re-deals remaining tiles into a solvable arrangement. Keeps mist/locks on positions. */
export function reshuffle(board: Board, rng: Rng): boolean {
  const present = board.tiles.map(t => !t.removed);
  const order = solvableOrder(board.tiles.map(t => t.pos), rng, present, 400);
  if (!order) return false;
  // Collect units (pairs) by group, pairing like attributes together.
  const byGroup = new Map<number, TileData[]>();
  for (const t of board.tiles) if (!t.removed) {
    const arr = byGroup.get(t.group) ?? []; arr.push(t); byGroup.set(t.group, arr);
  }
  interface Unit { faces: [number, number]; group: number; gold: boolean; bomb: number }
  const units: Unit[] = [];
  for (const [group, arr] of byGroup) {
    arr.sort((a, b) => (b.bomb - a.bomb) || (Number(b.gold) - Number(a.gold)));
    for (let i = 0; i + 1 < arr.length; i += 2)
      units.push({ faces: [arr[i].face, arr[i + 1].face], group, gold: arr[i].gold && arr[i + 1].gold, bomb: Math.min(arr[i].bomb, arr[i + 1].bomb) });
  }
  shuffle(units, rng);
  units.sort((a, b) => (a.bomb ? a.bomb : 999) - (b.bomb ? b.bomb : 999));
  order.forEach(([a, b], i) => {
    const u = units[i];
    for (const [k, tid] of [a, b].entries()) {
      const t = board.tiles[tid];
      t.face = u.faces[k]; t.group = u.group; t.gold = u.gold; t.bomb = u.bomb;
      if (t.lock > board.matches + i) t.lock = board.matches + i;
    }
  });
  return true;
}

/** Ranks available matches; tries a bounded DFS to find a move that keeps the board solvable. */
export function bestMove(board: Board, budget = 4000): [number, number] | null {
  const moves = rankMoves(board, board.availableMatches());
  if (moves.length === 0) return null;
  let nodes = 0;
  const dead = new Set<string>();
  const key = () => board.tiles.map(t => (t.removed ? '1' : '0')).join('');
  const dfs = (): boolean => {
    if (board.remaining() === 0) return true;
    if (++nodes > budget) return true; // optimistic when out of budget
    const k = key();
    if (dead.has(k)) return false;
    for (const [a, b] of rankMoves(board, board.availableMatches()).slice(0, 6)) {
      board.tiles[a].removed = true; board.tiles[b].removed = true; board.matches++;
      const ok = dfs();
      board.tiles[a].removed = false; board.tiles[b].removed = false; board.matches--;
      if (ok) return true;
    }
    dead.add(k);
    return false;
  };
  for (const [a, b] of moves) {
    board.tiles[a].removed = true; board.tiles[b].removed = true; board.matches++;
    const ok = dfs();
    board.tiles[a].removed = false; board.tiles[b].removed = false; board.matches--;
    if (ok) return [a, b];
    if (nodes > budget) break;
  }
  return moves[0];
}

function rankMoves(board: Board, moves: [number, number][]): [number, number][] {
  const score = ([a, b]: [number, number]) => {
    const ta = board.tiles[a], tb = board.tiles[b];
    let s = 0;
    if (ta.bomb) s += 1000 - ta.bomb * 10;
    if (ta.gold) s += 200;
    // Prefer high layers and tiles that block many others.
    s += (ta.pos.z + tb.pos.z) * 12;
    s += blocksCount(board, a) * 6 + blocksCount(board, b) * 6;
    return s;
  };
  return [...moves].sort((m1, m2) => score(m2) - score(m1));
}

function blocksCount(board: Board, id: number): number {
  let n = 0;
  const t = board.tiles;
  for (let i = 0; i < t.length; i++) {
    if (t[i].removed) continue;
    if (board.topo.above[i].includes(id) || board.topo.left[i].includes(id) || board.topo.right[i].includes(id)) n++;
  }
  return n;
}
