// One play session on one board: rules, scoring, mechanics, input, autosave.
import * as THREE from 'three';
import { Board, deal, reshuffle, bestMove, TileData } from './engine';
import { LAYOUT_BY_ID } from './layouts';
import type { LevelSpec } from './levels';
import { mulberry32, Rng } from './rng';
import { BoardView } from './boardview';
import type { Stage } from './stage';
import { audio } from './audio';
import type { HistoryEntry, Snapshot } from './save';
import type { GameResult } from './achievements';

export interface HudState {
  name: string; score: number; combo: number; elapsed: number; timeLeft: number | null;
  tilesLeft: number; tilesTotal: number; moves: number; hints: number; shuffles: number; undos: number;
  goldLeft: number; goldTotal: number; objective: 'clear' | 'gold'; nextBomb: number | null; comboWindow: number;
}

export type EndCause = 'cleared' | 'gold' | 'bomb' | 'clock' | 'stuck';

export interface EndInfo {
  won: boolean; reason: string; cause: EndCause; stars: number; score: number; time: number; result: GameResult;
  starReasons: [boolean, boolean, boolean];
}

export interface GameEvents {
  hud(s: HudState): void;
  end(e: EndInfo): void;
  toast(msg: string, kind?: 'info' | 'warn' | 'good'): void;
  popup(text: string, at: THREE.Vector3, color: string): void;
  event?(name: string, data?: unknown): void;
}

const COMBO_WINDOW = 4.5;

export class Game {
  board!: Board;
  private rng: Rng;
  selected = -1;
  score = 0; combo = 0; maxCombo = 0; private sinceMatch = 99;
  elapsed = 0;
  running = false; paused = false; ended = false;
  hintsLeft: number; shufflesLeft: number; undosLeft: number;
  hintsUsed = 0; shufflesUsed = 0; undosUsed = 0;
  goldTotal = 0; goldLeft = 0;
  history: HistoryEntry[] = [];
  private hudTimer = 0;
  private hintTimer = 0;
  private revealed = new Set<number>();
  private winds = new Set<number>();
  private dragonStreak = 0; private bestDragonStreak = 0;
  private flower = false; private season = false; private stuckShuffle = false;
  private lastFree: boolean[] = [];
  private disposers: (() => void)[] = [];
  private autosaveTimer = 0;
  counters = { mistRevealed: 0, goldCollected: 0, bombsDefused: 0, locksBroken: 0, matches: 0 };
  inputLocked = false;
  allowInput: ((id: number) => boolean) | null = null; // tutorial gate

  constructor(
    private stage: Stage, public view: BoardView, public spec: LevelSpec, private ev: GameEvents,
    private autosave: (s: Snapshot) => void, snapshot?: Snapshot, public story?: { ch: number; board: number },
  ) {
    this.rng = mulberry32(spec.seed ^ 0x9e3779b9);
    this.hintsLeft = spec.hints; this.shufflesLeft = spec.shuffles; this.undosLeft = spec.undos;
    if (snapshot) this.restore(snapshot);
    else {
      const d = deal(LAYOUT_BY_ID[spec.layout].positions, spec, mulberry32(spec.seed));
      this.board = new Board(d.tiles);
    }
    this.goldTotal = this.board.tiles.filter(t => t.gold).length / 2;
    if (!snapshot) this.goldLeft = this.goldTotal;
  }

  private restore(s: Snapshot) {
    this.board = new Board(s.tiles.map(t => ({ ...t, pos: { ...t.pos } })));
    this.board.matches = s.matches;
    this.score = s.score; this.combo = 0; this.maxCombo = s.maxCombo; this.elapsed = s.elapsed;
    this.hintsLeft = s.hintsLeft; this.shufflesLeft = s.shufflesLeft; this.undosLeft = s.undosLeft;
    this.hintsUsed = s.hintsUsed; this.shufflesUsed = s.shufflesUsed; this.undosUsed = s.undosUsed;
    this.goldLeft = s.goldLeft; this.history = s.history ?? [];
  }

  async start(animate = true) {
    const free = this.board.freeMap();
    this.lastFree = free;
    free.forEach((f, i) => { if (f) this.revealed.add(i); });
    const built = this.view.build(this.board.tiles, animate);
    this.view.refreshAll(this.board.tiles, free, this.board.matches);
    const fr = this.view.framing();
    this.stage.setCinematic(false);
    this.stage.controls.enabled = false;
    await Promise.all([this.stage.flyTo(fr.pos, fr.target, animate ? 2.0 : 0.8), built]);
    this.stage.controls.enabled = true;
    this.bindInput();
    this.running = true;
    this.updateStorySaturation();
    this.pushHud();
    this.ev.event?.('started');
    this.checkStuck();
  }

  // ---------------- input ----------------
  touchAssist = true;
  private zoomed = false;

  private bindInput() {
    const canvas = this.stage.renderer.domElement;
    let down: { x: number; y: number; t: number; type: string } | null = null;
    let lastHover = 0;
    let pressTimer = 0;
    let longPressed = false;
    const pointers = new Set<number>();
    const ndcAt = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    };
    const cancelPress = () => { clearTimeout(pressTimer); pressTimer = 0; };
    const pd = (e: PointerEvent) => {
      pointers.add(e.pointerId);
      longPressed = false;
      cancelPress();
      if (pointers.size > 1) { down = null; return; } // pinch / two-finger gesture
      down = { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType };
      if (e.pointerType !== 'mouse') {
        pressTimer = window.setTimeout(() => {
          if (!down || pointers.size !== 1) return;
          longPressed = true;
          navigator.vibrate?.(12);
          this.toggleZoom(ndcAt(down.x, down.y));
        }, 450);
      }
    };
    const pu = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      cancelPress();
      if (!down || e.button !== 0 || longPressed) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const type = down.type;
      down = null;
      if (moved > 10) { this.ev.event?.('camera'); return; }
      this.pickAt(e.clientX, e.clientY, ndcAt(e.clientX, e.clientY), type !== 'mouse');
    };
    const pm = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) cancelPress();
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - lastHover < 45) return;
      lastHover = now;
      const id = this.view.pick(ndcAt(e.clientX, e.clientY));
      const ok = id >= 0 && this.board.isSelectable(id);
      this.view.setHover(ok ? id : -1);
      canvas.style.cursor = ok ? 'pointer' : id >= 0 ? 'not-allowed' : 'grab';
    };
    const pc = (e: PointerEvent) => { pointers.delete(e.pointerId); cancelPress(); down = null; };
    canvas.addEventListener('pointerdown', pd);
    canvas.addEventListener('pointerup', pu);
    canvas.addEventListener('pointermove', pm);
    canvas.addEventListener('pointercancel', pc);
    this.disposers.push(() => {
      canvas.removeEventListener('pointerdown', pd);
      canvas.removeEventListener('pointerup', pu);
      canvas.removeEventListener('pointermove', pm);
      canvas.removeEventListener('pointercancel', pc);
      cancelPress();
      canvas.style.cursor = '';
    });
  }

  /**
   * Resolves a tap to a tile. On touch, a tap that misses or lands on a blocked
   * tile snaps to the nearest selectable tile within a finger-sized radius.
   */
  private pickAt(px: number, py: number, ndc: THREE.Vector2, touch: boolean) {
    let id = this.view.pick(ndc);
    if (touch && this.touchAssist && (id < 0 || !this.board.isSelectable(id))) {
      const candidates = this.board.tiles.filter(t => this.board.isSelectable(t.id)).map(t => t.id);
      const snapped = this.view.nearestOnScreen(px, py, candidates, 34);
      if (snapped >= 0) id = snapped;
    }
    if (id >= 0) this.click(id);
    else if (this.selected >= 0) { this.selected = -1; this.view.setSelected(-1); }
  }

  /** Press-and-hold: zoom into that spot of the board, or back out if already zoomed. */
  toggleZoom(ndc: THREE.Vector2) {
    if (!this.running || this.paused) return;
    if (this.zoomed) { this.resetZoom(); return; }
    const p = this.view.boardPoint(ndc);
    if (!p) return;
    const cam = this.stage.camera, target = this.stage.controls.target;
    const dir = cam.position.clone().sub(target).normalize();
    const dist = Math.max(6, cam.position.distanceTo(target) * 0.45);
    this.zoomed = true;
    this.stage.flyTo(p.clone().add(dir.multiplyScalar(dist)), p, 0.55);
    this.ev.event?.('zoom');
  }

  resetZoom() {
    this.zoomed = false;
    const f = this.view.framing();
    this.stage.flyTo(f.pos, f.target, 0.6);
  }

  click(id: number) {
    if (!this.running || this.paused || this.ended || this.inputLocked) return;
    if (this.allowInput && !this.allowInput(id)) return;
    audio.unlock();
    const t = this.board.tiles[id];
    if (t.removed) return;
    if (t.lock > this.board.matches) {
      this.view.shakeTile(id); audio.play('blocked');
      this.ev.toast(`Chained — ${t.lock - this.board.matches} more match${t.lock - this.board.matches > 1 ? 'es' : ''} to break it`, 'warn');
      this.ev.event?.('locked', id);
      return;
    }
    if (!this.board.isFree(id)) {
      this.view.shakeTile(id); audio.play('blocked');
      this.ev.event?.('blocked', id);
      return;
    }
    if (this.selected === id) { this.selected = -1; this.view.setSelected(-1); audio.play('ui'); return; }
    if (this.selected >= 0 && this.board.canMatch(this.selected, id)) { this.match(this.selected, id); return; }
    if (this.selected >= 0) this.ev.event?.('mismatch', id);
    this.selected = id;
    this.view.setSelected(id);
    audio.play('select');
    this.ev.event?.('select', id);
  }

  private match(a: number, b: number) {
    const ta = this.board.tiles[a], tb = this.board.tiles[b];
    this.view.setHint([]);
    const entry: HistoryEntry = {
      a, b, score: this.score, combo: this.combo,
      bombs: this.board.tiles.filter(t => t.bomb && !t.removed).map(t => [t.id, t.bomb] as [number, number]),
      gold: ta.gold && tb.gold, bombPair: !!ta.bomb && !!tb.bomb,
    };
    this.history.push(entry);
    ta.removed = true; tb.removed = true;
    this.board.matches++;
    this.selected = -1;
    this.counters.matches++;
    // combo + score
    this.combo = this.sinceMatch <= COMBO_WINDOW ? this.combo + 1 : 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.sinceMatch = 0;
    let pts = 10 * this.combo + (ta.pos.z + tb.pos.z) * 2;
    const at = this.view.worldPos(ta.pos).lerp(this.view.worldPos(tb.pos), 0.5);
    at.y += 2.4;
    if (entry.gold) { pts += 60; this.goldLeft--; this.counters.goldCollected++; audio.play('gold'); this.ev.popup('GOLD +60', at.clone().add(new THREE.Vector3(0, 0.6, 0)), '#ffd76a'); }
    if (entry.bombPair) { pts += 40; this.counters.bombsDefused++; this.ev.toast('Bomb defused!', 'good'); }
    else if (ta.bomb || tb.bomb) this.ev.toast('Its twin bomb is still ticking — pair it before the fuse runs out!', 'warn');
    this.score += pts;
    this.ev.popup(this.combo > 1 ? `+${pts}  ×${this.combo}` : `+${pts}`, at, this.combo > 2 ? '#ffcc44' : '#ffffff');
    audio.play('match', this.combo);
    // trivia trackers for achievements
    if (ta.group >= 27 && ta.group <= 30) this.winds.add(ta.group);
    if (ta.group >= 31 && ta.group <= 33) { this.dragonStreak++; this.bestDragonStreak = Math.max(this.bestDragonStreak, this.dragonStreak); } else this.dragonStreak = 0;
    if (ta.group === 34) this.flower = true;
    if (ta.group === 35) this.season = true;
    // bombs tick down
    let exploded: number[] = [];
    for (const t of this.board.tiles) {
      if (t.removed || !t.bomb) continue;
      t.bomb--;
      if (t.bomb <= 0) exploded.push(t.id);
      else if (t.bomb <= 3) audio.play('tick');
    }
    const color = entry.gold ? '#ffd76a' : this.stage.biome.accent;
    this.view.animateMatch(a, b, color);
    this.afterChange();
    this.ev.event?.('match', [a, b]);
    if (exploded.length) {
      exploded = [...new Set(exploded)];
      this.view.explode(exploded);
      audio.play('boom');
      this.stage.doShake(0.6);
      this.stage.flash('#ff4a1a', 0.5, 0.8);
      this.finish(false, 'A bomb went off!', 'bomb');
      return;
    }
    this.checkEnd();
    this.scheduleAutosave();
  }

  private afterChange() {
    const free = this.board.freeMap();
    for (const t of this.board.tiles) {
      if (t.removed) continue;
      if (free[t.id] && !this.lastFree[t.id] && t.mist && !this.revealed.has(t.id)) { this.counters.mistRevealed++; audio.play('reveal'); }
      if (free[t.id]) this.revealed.add(t.id);
      if (t.lock && t.lock === this.board.matches) { this.counters.locksBroken++; audio.play('unlock'); }
    }
    this.lastFree = free;
    this.view.refreshAll(this.board.tiles, free, this.board.matches);
    this.updateStorySaturation();
    this.pushHud();
  }

  private updateStorySaturation() {
    if (this.spec.mode !== 'story') { this.stage.saturation = 1; return; }
    const total = this.board.tiles.length;
    const done = total - this.board.remaining();
    this.stage.saturation = 0.06 + 0.94 * Math.pow(done / total, 0.8);
  }

  private checkEnd() {
    const remaining = this.board.remaining();
    if (remaining === 0) return this.finish(true, 'Board cleared!', 'cleared');
    if (this.spec.objective === 'gold' && this.goldTotal > 0 && this.goldLeft <= 0) return this.finish(true, 'Every golden pair collected!', 'gold');
    this.checkStuck();
  }

  private shufflePending = false;

  private checkStuck() {
    if (this.ended || this.shufflePending) return;
    if (this.board.availableMatches().length > 0) return;
    // Locked tiles might be the only ones free: if there are none free at all it's a true dead end.
    if (this.shufflesLeft !== 0) {
      this.ev.toast('No moves left — the winds reshuffle the tiles', 'warn');
      this.stuckShuffle = true;
      this.shufflePending = true;
      setTimeout(() => { this.shufflePending = false; this.shuffle(true); }, 700);
    } else {
      this.finish(false, 'No moves left', 'stuck');
    }
  }

  hint() {
    if (!this.running || this.paused || this.ended) return;
    if (this.hintsLeft === 0) { this.ev.toast('No hints left', 'warn'); audio.play('blocked'); return; }
    const m = bestMove(this.board, 2500);
    if (!m) { this.checkStuck(); return; }
    if (this.hintsLeft > 0) this.hintsLeft--;
    this.hintsUsed++;
    this.view.setHint(m);
    this.hintTimer = 4;
    audio.play('hint');
    this.pushHud();
    this.ev.event?.('hint', m);
  }

  async shuffle(auto = false) {
    if (!this.running || this.ended) return;
    if (!auto && this.paused) return;
    if (this.shufflesLeft === 0) { this.ev.toast('No shuffles left', 'warn'); audio.play('blocked'); return; }
    if (!reshuffle(this.board, this.rng)) { this.ev.toast('The tiles refuse to move…', 'warn'); return; }
    if (this.shufflesLeft > 0) this.shufflesLeft--;
    this.shufflesUsed++;
    this.selected = -1; this.view.setSelected(-1); this.view.setHint([]);
    this.history = []; // undo across a shuffle is not allowed
    audio.play('shuffle');
    this.inputLocked = true;
    const free = this.board.freeMap();
    this.lastFree = free;
    await this.view.shuffleAnim(this.board.tiles, free, this.board.matches);
    this.inputLocked = false;
    this.afterChange();
    this.ev.event?.('shuffle');
    this.scheduleAutosave();
    this.checkStuck();
  }

  undo() {
    if (!this.running || this.paused || this.ended) return;
    const h = this.history.pop();
    if (!h) { this.ev.toast('Nothing to undo', 'info'); return; }
    if (this.undosLeft === 0) { this.history.push(h); this.ev.toast('No undos left', 'warn'); audio.play('blocked'); return; }
    if (this.undosLeft > 0) this.undosLeft--;
    this.undosUsed++;
    const ta = this.board.tiles[h.a], tb = this.board.tiles[h.b];
    ta.removed = false; tb.removed = false;
    this.board.matches--;
    this.score = h.score; this.combo = h.combo; this.sinceMatch = 99;
    if (h.gold) this.goldLeft++;
    for (const [id, v] of h.bombs) this.board.tiles[id].bomb = v;
    this.view.restore(h.a); this.view.restore(h.b);
    this.selected = -1; this.view.setSelected(-1);
    audio.play('undo');
    this.afterChange();
    this.ev.event?.('undo');
    this.scheduleAutosave();
  }

  setPaused(p: boolean) {
    if (this.ended) return;
    this.paused = p;
    this.stage.controls.enabled = !p;
    if (p) this.saveNow();
  }

  tick(dt: number) {
    if (!this.running || this.paused || this.ended) return;
    this.elapsed += dt;
    this.sinceMatch += dt;
    if (this.sinceMatch > COMBO_WINDOW && this.combo > 0) { this.combo = 0; }
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.view.setHint([]); }
    if (this.spec.timeLimit && this.elapsed >= this.spec.timeLimit) {
      this.elapsed = this.spec.timeLimit;
      this.stage.flash('#ffffff', 0.4, 0.6);
      this.finish(false, 'The sand clock ran out', 'clock');
      return;
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.2; this.pushHud(); }
    if (this.autosaveTimer > 0) { this.autosaveTimer -= dt; if (this.autosaveTimer <= 0) this.saveNow(); }
  }

  private pushHud() {
    const bombs = this.board.tiles.filter(t => t.bomb && !t.removed).map(t => t.bomb);
    this.ev.hud({
      name: this.spec.name, score: this.score, combo: this.combo, elapsed: this.elapsed,
      timeLeft: this.spec.timeLimit ? Math.max(0, this.spec.timeLimit - this.elapsed) : null,
      tilesLeft: this.board.remaining(), tilesTotal: this.board.tiles.length,
      moves: this.board.availableMatches().length, hints: this.hintsLeft, shuffles: this.shufflesLeft, undos: this.undosLeft,
      goldLeft: this.goldLeft, goldTotal: this.goldTotal, objective: this.spec.objective,
      nextBomb: bombs.length ? Math.min(...bombs) : null, comboWindow: Math.max(0, 1 - this.sinceMatch / COMBO_WINDOW),
    });
  }

  private finish(won: boolean, reason: string, cause: EndCause) {
    if (this.ended) return;
    this.ended = true;
    this.running = false;
    this.stage.controls.enabled = true;
    const timeOk = this.elapsed <= this.spec.parTime;
    const clean = this.hintsUsed === 0 && this.undosUsed === 0 && (this.shufflesUsed === 0 || (this.stuckShuffle && this.shufflesUsed === 1));
    let bonus = 0;
    if (won) {
      bonus += this.spec.timeLimit ? Math.round((this.spec.timeLimit - this.elapsed) * 3) : Math.max(0, Math.round((this.spec.parTime - this.elapsed) * 2));
      if (this.hintsUsed === 0) bonus += 150;
      bonus += this.board.tiles.length * 2;
      this.score += bonus;
    }
    const starReasons: [boolean, boolean, boolean] = [won, won && timeOk, won && clean];
    const stars = starReasons.filter(Boolean).length;
    if (won) {
      this.stage.saturation = 1;
      audio.play('win');
      this.view.fireworks(this.board.tiles.length > 80 ? 12 : 7);
      this.stage.flash(this.stage.biome.accent2, 0.35, 1.2);
    } else {
      audio.play('fail');
    }
    const result: GameResult = {
      spec: this.spec, won, score: this.score, time: this.elapsed, maxCombo: this.maxCombo,
      hintsUsed: this.hintsUsed, shufflesUsed: this.shufflesUsed, undosUsed: this.undosUsed, stuckShuffle: this.stuckShuffle,
      winds: [...this.winds], dragonStreak: this.bestDragonStreak, flower: this.flower, season: this.season, tiles: this.board.tiles.length,
    };
    this.pushHud();
    setTimeout(() => this.ev.end({ won, reason, cause, stars, score: this.score, time: this.elapsed, result, starReasons }), won ? 1600 : 1100);
  }

  private scheduleAutosave() { this.autosaveTimer = 0.6; }

  snapshot(label = ''): Snapshot {
    return {
      version: 1, savedAt: Date.now(), label: label || this.spec.name, spec: this.spec,
      tiles: this.board.tiles.map((t: TileData) => ({ ...t, pos: { ...t.pos } })),
      matches: this.board.matches, score: this.score, combo: this.combo, maxCombo: this.maxCombo, elapsed: this.elapsed,
      hintsLeft: this.hintsLeft, shufflesLeft: this.shufflesLeft, undosLeft: this.undosLeft,
      hintsUsed: this.hintsUsed, shufflesUsed: this.shufflesUsed, undosUsed: this.undosUsed,
      goldLeft: this.goldLeft, history: this.history, story: this.story,
    };
  }

  saveNow() {
    if (this.ended || this.spec.mode === 'tutorial' || !this.running) return;
    this.autosaveTimer = 0;
    this.autosave(this.snapshot());
  }

  dispose() {
    this.running = false;
    this.disposers.forEach(d => d());
    this.disposers = [];
    this.view.clear();
    this.stage.saturation = 1;
  }
}
