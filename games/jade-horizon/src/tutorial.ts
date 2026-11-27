// Guided first lesson: event-driven coach steps on top of a normal Game.
import type { Game } from './game';

export interface TutStep {
  text: string;
  title: string;
  wait?: string;         // game event that completes the step
  next?: boolean;        // show a Next button
  onEnter?: (g: Game) => void;
  glossary?: boolean;
}

export const TUTORIAL_STEPS: TutStep[] = [
  { title: 'Welcome, Wayfarer', text: 'This is a board of Jade Tiles. Your goal is simple: clear it by matching pairs of identical tiles.', next: true },
  { title: 'Free tiles', text: 'You can only take a tile that is <b>free</b>: nothing sits on top of it, and its left <i>or</i> right side is open. Blocked tiles are dimmed.', next: true },
  { title: 'Select', text: 'Tap or click any bright, free tile to pick it up.', wait: 'select' },
  {
    title: 'Match', text: 'Now tap its twin — the tile with the same picture. I’ve made it glow for you.', wait: 'match',
    onEnter: g => {
      const sel = g.selected;
      const twin = g.board.tiles.find(t => t.id !== sel && !t.removed && t.group === g.board.tiles[sel]?.group && g.board.isSelectable(t.id));
      if (twin) g.view.setHint([twin.id]);
    },
  },
  { title: 'Blocked tiles', text: 'Try tapping a dimmed, blocked tile. It won’t budge until the tiles pinning it are gone.', wait: 'blocked', next: true },
  { title: 'Hints', text: 'Stuck? Press <b>Hint</b> (or the H key). It shows a pair that keeps the board winnable.', wait: 'hint' },
  { title: 'Undo', text: 'Changed your mind? <b>Undo</b> (Z) puts the last pair back. Make a match, then try it.', wait: 'undo' },
  { title: 'Shuffle', text: 'If no moves remain, <b>Shuffle</b> (S) re-deals the remaining tiles into a solvable arrangement. Give it a spin.', wait: 'shuffle' },
  { title: 'Look around', text: 'Drag to orbit the camera. Scroll or pinch to zoom, right-drag to pan. Press R to recenter.', wait: 'camera', next: true },
  { title: 'Combos', text: 'Matches made within a few seconds of each other build a <b>combo</b> multiplier. Watch the meter under your score.', next: true },
  { title: 'What lies ahead', text: 'Later realms add twists. Learn their signs:', next: true, glossary: true },
  { title: 'Clear the board', text: 'That’s everything. Clear the remaining tiles to finish your lesson.', wait: 'won' },
];
