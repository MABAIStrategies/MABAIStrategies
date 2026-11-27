import { describe, it, expect } from 'vitest';
import { LAYOUTS } from '../src/layouts';
import { deal, Board, reshuffle, bestMove } from '../src/engine';
import { mulberry32 } from '../src/rng';

function playOut(board: Board, order: [number, number][]) {
  for (const [a, b] of order) {
    expect(board.isSelectable(a) || board.tiles[a].lock > board.matches).toBe(true);
    expect(board.isFree(a) && board.isFree(b)).toBe(true);
    expect(board.canMatch(a, b)).toBe(true);
    board.tiles[a].removed = true; board.tiles[b].removed = true; board.matches++;
  }
  expect(board.remaining()).toBe(0);
}

describe('layouts', () => {
  for (const L of LAYOUTS) {
    it(`${L.id} (${L.positions.length}) deals solvably with all mechanics`, () => {
      expect(L.positions.length % 2).toBe(0);
      expect(L.positions.length).toBeGreaterThanOrEqual(12);
      for (let s = 1; s <= 4; s++) {
        const d = deal(L.positions, { copies: s % 2 ? 4 : 2, mist: 0.5, locks: 4, gold: 3, bombs: 2, bombMoves: 10 }, mulberry32(s * 977));
        const board = new Board(d.tiles);
        // locks must be satisfied by the guaranteed order
        d.order.forEach(([a, b], i) => {
          expect(d.tiles[a].lock).toBeLessThanOrEqual(i);
          expect(d.tiles[b].lock).toBeLessThanOrEqual(i);
          if (d.tiles[a].bomb) expect(i + 1).toBeLessThanOrEqual(d.tiles[a].bomb);
        });
        playOut(board, d.order);
      }
    });
  }
});

describe('reshuffle + solver', () => {
  it('reshuffles a partially played turtle and stays consistent', () => {
    const L = LAYOUTS.find(l => l.id === 'turtle')!;
    const d = deal(L.positions, { copies: 4, mist: 0, locks: 0, gold: 0, bombs: 0, bombMoves: 0 }, mulberry32(5));
    const board = new Board(d.tiles);
    for (const [a, b] of d.order.slice(0, 20)) { board.tiles[a].removed = true; board.tiles[b].removed = true; board.matches++; }
    const groupsBefore = board.tiles.filter(t => !t.removed).map(t => t.group).sort().join();
    expect(reshuffle(board, mulberry32(9))).toBe(true);
    const groupsAfter = board.tiles.filter(t => !t.removed).map(t => t.group).sort().join();
    expect(groupsAfter).toBe(groupsBefore);
    // greedy solver should be able to clear with bestMove most of the time
    let moves = 0;
    while (board.remaining() > 0 && moves < 100) {
      const m = bestMove(board, 3000);
      if (!m) { expect(reshuffle(board, mulberry32(moves))).toBe(true); moves++; continue; }
      board.tiles[m[0]].removed = true; board.tiles[m[1]].removed = true; board.matches++; moves++;
    }
    expect(board.remaining()).toBe(0);
  });
});

describe('content', () => {
  it('has exactly 50 achievements with unique ids', async () => {
    const { ACHIEVEMENTS } = await import('../src/achievements');
    expect(ACHIEVEMENTS.length).toBe(50);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(50);
  });
  it('builds 80 campaign levels that all deal', async () => {
    const { campaignLevel, CAMPAIGN_COUNT } = await import('../src/levels');
    const { LAYOUT_BY_ID } = await import('../src/layouts');
    expect(CAMPAIGN_COUNT).toBe(80);
    for (let n = 1; n <= CAMPAIGN_COUNT; n++) {
      const s = campaignLevel(n);
      const d = deal(LAYOUT_BY_ID[s.layout].positions, s, mulberry32(s.seed));
      const golds = d.tiles.filter(t => t.gold).length / 2;
      if (s.objective === 'gold') expect(golds).toBe(s.gold);
      playOut(new Board(d.tiles), d.order);
    }
  });
});
