// Headless player simulation for difficulty tuning. Plays a level the way a person
// might (no undo, limited hints and shuffles) and reports whether it was won.
import { Board, deal, reshuffle, bestMove } from './engine';
import { LAYOUT_BY_ID } from './layouts';
import type { LevelSpec } from './levels';
import { mulberry32, Rng } from './rng';

export type Skill = 'casual' | 'skilled';
export type Outcome = 'won' | 'bomb' | 'stuck';

export interface SimResult { outcome: Outcome; matches: number; shufflesUsed: number; hintsUsed: number }

/** Matches a person makes per second is modelled separately (see estimateSeconds). */
export function simulate(spec: LevelSpec, skill: Skill, rng: Rng): SimResult {
  const d = deal(LAYOUT_BY_ID[spec.layout].positions, spec, mulberry32(spec.seed));
  const board = new Board(d.tiles);
  let shuffles = spec.shuffles, hints = spec.hints;
  let shufflesUsed = 0, hintsUsed = 0;
  const goldTotal = board.tiles.filter(t => t.gold).length / 2;
  let goldLeft = goldTotal;
  for (let guard = 0; guard < 400; guard++) {
    if (board.remaining() === 0) return { outcome: 'won', matches: board.matches, shufflesUsed, hintsUsed };
    if (spec.objective === 'gold' && goldTotal > 0 && goldLeft <= 0) return { outcome: 'won', matches: board.matches, shufflesUsed, hintsUsed };
    const moves = board.availableMatches();
    if (!moves.length) {
      if (shuffles === 0) return { outcome: 'stuck', matches: board.matches, shufflesUsed, hintsUsed };
      if (!reshuffle(board, rng)) return { outcome: 'stuck', matches: board.matches, shufflesUsed, hintsUsed };
      if (shuffles > 0) shuffles--;
      shufflesUsed++;
      continue;
    }
    let move: [number, number];
    // Attentive players pair bomb with bomb, so no fuse is left ticking alone.
    const bombScore = ([a, b]: [number, number]) => (board.tiles[a].bomb && board.tiles[b].bomb ? 1000 : 0) - Math.min(board.tiles[a].bomb || 99, board.tiles[b].bomb || 99);
    const bombMove = moves.filter(([a, b]) => board.tiles[a].bomb > 0 || board.tiles[b].bomb > 0)
      .filter(m => skill === 'skilled' || board.tiles[m[0]].bomb && board.tiles[m[1]].bomb || rng() < 0.5)
      .sort((x, y) => bombScore(y) - bombScore(x))[0];
    const dig = digTowardBombs(board, moves);
    if (bombMove) move = bombMove;
    else if (dig.length && (skill === 'skilled' || rng() < 0.6)) move = dig[Math.floor(rng() * dig.length)];
    else if (skill === 'casual') move = moves[Math.floor(rng() * moves.length)];
    else {
      const ambiguous = groupsWithChoice(board, moves);
      const urgentBomb = board.tiles.some(t => !t.removed && t.bomb > 0 && t.bomb <= 4);
      if (hints !== 0 && (ambiguous || urgentBomb)) {
        const m = bestMove(board, 600);
        if (hints > 0) hints--;
        hintsUsed++;
        move = m ?? moves[0];
      } else move = skilledPick(board, moves, rng);
    }
    const [a, b] = move;
    const gold = board.tiles[a].gold && board.tiles[b].gold;
    board.tiles[a].removed = true; board.tiles[b].removed = true;
    board.matches++;
    if (gold) goldLeft--;
    for (const t of board.tiles) {
      if (t.removed || !t.bomb) continue;
      t.bomb--;
      if (t.bomb <= 0) return { outcome: 'bomb', matches: board.matches, shufflesUsed, hintsUsed };
    }
  }
  return { outcome: 'stuck', matches: board.matches, shufflesUsed, hintsUsed };
}

/** Moves that remove a tile pinning a live bomb — what a person does once they see a fuse. */
function digTowardBombs(board: Board, moves: [number, number][]): [number, number][] {
  const pins = new Set<number>();
  for (const t of board.tiles) {
    if (t.removed || !t.bomb || board.isFree(t.id)) continue;
    for (const j of board.topo.above[t.id]) if (!board.tiles[j].removed) pins.add(j);
    const left = board.topo.left[t.id].filter(j => !board.tiles[j].removed);
    const right = board.topo.right[t.id].filter(j => !board.tiles[j].removed);
    for (const j of (left.length <= right.length ? left : right)) pins.add(j);
  }
  return pins.size ? moves.filter(([a, b]) => pins.has(a) || pins.has(b)) : [];
}

function groupsWithChoice(board: Board, moves: [number, number][]): boolean {
  const per = new Map<number, Set<number>>();
  for (const [a, b] of moves) {
    const g = board.tiles[a].group;
    const s = per.get(g) ?? new Set<number>();
    s.add(a); s.add(b); per.set(g, s);
  }
  for (const s of per.values()) if (s.size === 3) return true;
  return false;
}

/** One-step lookahead: prefer gold, then moves that unblock the most tiles. */
function skilledPick(board: Board, moves: [number, number][], rng: Rng): [number, number] {
  const freeBefore = board.freeMap().filter(Boolean).length;
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const [a, b] = m;
    board.tiles[a].removed = true; board.tiles[b].removed = true;
    const freed = board.freeMap().filter(Boolean).length - (freeBefore - 2);
    board.tiles[a].removed = false; board.tiles[b].removed = false;
    const t = board.tiles[a];
    const score = freed * 3 + (t.gold ? 8 : 0) + (t.pos.z + board.tiles[b].pos.z) + rng();
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export { estimateSeconds } from './levels';
