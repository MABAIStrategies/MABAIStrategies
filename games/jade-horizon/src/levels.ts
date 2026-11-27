// Level definitions: 80-level campaign, quick-play tiers, tutorial.
import { BIOMES } from './biomes';
import { layoutSize } from './layouts';
import { hashString } from './rng';

export interface LevelSpec {
  key: string;
  mode: 'campaign' | 'quick' | 'story' | 'tutorial';
  name: string;
  layout: string;
  biome: number;
  seed: number;
  copies: 2 | 4;
  objective: 'clear' | 'gold';
  timeLimit: number;   // seconds, 0 = none
  parTime: number;     // seconds for the time star
  mist: number;
  locks: number;
  gold: number;
  bombs: number;
  bombMoves: number;
  hints: number;       // -1 = unlimited
  shuffles: number;
  undos: number;
  tier?: TierId;
  number?: number;     // campaign level number
  boss?: boolean;
  assisted?: boolean;  // Lantern's Blessing applied after repeated losses
}

/** Extra help offered after three losses in a row on the same level. */
export function withBlessing(s: LevelSpec): LevelSpec {
  return {
    ...s, assisted: true,
    hints: s.hints < 0 ? s.hints : s.hints + 2,
    shuffles: s.shuffles < 0 ? s.shuffles : s.shuffles + 1,
    timeLimit: s.timeLimit ? Math.round(s.timeLimit * 1.25) : 0,
    bombMoves: s.bombs ? s.bombMoves + 3 : s.bombMoves,
  };
}

export const BLESSING_TEXT = '+2 hints, +1 shuffle, 25% more time and longer bomb fuses';

export const CAMPAIGN_WORLDS = 8;
export const LEVELS_PER_WORLD = 10;
export const CAMPAIGN_COUNT = CAMPAIGN_WORLDS * LEVELS_PER_WORLD;

// Layout progression per world (10 levels each, last is the realm boss).
const WORLD_LAYOUTS: string[][] = [
  ['petal', 'steps', 'crossroads', 'garden', 'pyramid_s', 'shrine', 'moon', 'petal', 'terrace', 'crane'],
  ['garden', 'shrine', 'moon', 'koi', 'terrace', 'crane', 'dragon', 'lantern', 'moon', 'pagoda'],
  ['terrace', 'koi', 'lantern', 'dragon', 'crane', 'wall', 'fortress', 'butterfly', 'lantern', 'bridge'],
  ['crane', 'wall', 'dragon', 'pagoda', 'butterfly', 'arena', 'fortress', 'bridge', 'koi', 'pyramid'],
  ['lantern', 'pagoda', 'arena', 'butterfly', 'bridge', 'fortress', 'lotus', 'twin', 'arena', 'turtle'],
  ['fortress', 'arena', 'bridge', 'lotus', 'twin', 'pyramid', 'butterfly', 'hollow', 'lotus', 'starfall'],
  ['bridge', 'lotus', 'twin', 'pyramid', 'hollow', 'turtle', 'arena', 'starfall', 'twin', 'hollow'],
  ['pyramid', 'hollow', 'turtle', 'lotus', 'starfall', 'twin', 'turtle', 'hollow', 'starfall', 'turtle'],
];

const LEVEL_NAMES = [
  ['First Petals', 'Stepping Stones', 'Shrine Road', 'Courtyard', 'Little Summit', 'Hill Prayer', 'Pond Moon', 'Second Bloom', 'Terraced Rows', 'Crane of Spring'],
  ['Green Gate', 'Misty Altar', 'Moonlit Grove', 'Koi Stream', 'Cloud Fields', 'White Crane', 'Jade Serpent', 'Paper Glow', 'Silver Pond', 'Pagoda of Whispers'],
  ['Dock Steps', 'Lantern Koi', 'Harbor Glow', 'Sea Dragon', 'Night Crane', 'Seawall', 'Harbor Keep', 'Moth Wings', 'Festival Night', 'Bridge of Lights'],
  ['Dune Crane', 'Sand Wall', 'Dust Serpent', 'Sun Pagoda', 'Mirage Wings', 'Echo Arena', 'Oasis Keep', 'Sun Bridge', 'Dry River', 'The Great Pyramid'],
  ['Ice Lantern', 'Frost Pagoda', 'Snow Arena', 'Ice Wings', 'Glacier Bridge', 'Monastery Walls', 'Frozen Lotus', 'Twin Glaciers', 'Bell Court', 'Turtle of Ice'],
  ['Copper Keep', 'Red Arena', 'Canyon Bridge', 'Ember Lotus', 'Twin Mesas', 'Copper Pyramid', 'Leaf Wings', 'Hollow Gorge', 'Maple Lotus', 'Fall of Stars'],
  ['Magma Bridge', 'Fire Lotus', 'Twin Calderas', 'Ash Pyramid', 'Obsidian Throne', 'Molten Shell', 'Cinder Ring', 'Burning Sky', 'Twin Furnaces', 'Heart of the Forge'],
  ['Star Pyramid', 'Void Throne', 'Sky Shell', 'Nebula Lotus', 'Starfall', 'Comet Peaks', 'Celestial Shell', 'Hollow Heavens', 'Last Constellation', 'Horizon of Jade'],
];

// Within each realm the difficulty breathes: a gentle opener, a rise, a breather
// before the climb to the boss. Multiplies pressure (mist, clock tightness).
const RHYTHM = [0.85, 0.95, 1.0, 1.05, 1.1, 0.9, 1.05, 1.1, 1.0, 1.15];

export function campaignLevel(n: number): LevelSpec {
  const w = Math.floor((n - 1) / LEVELS_PER_WORLD);
  const i = (n - 1) % LEVELS_PER_WORLD;
  const boss = i === LEVELS_PER_WORLD - 1;
  const layout = WORLD_LAYOUTS[w][i];
  const tiles = layoutSize(layout);
  const p = (w * 10 + i) / (CAMPAIGN_COUNT - 1); // 0..1 global progress
  const r = RHYTHM[i];
  const spec: LevelSpec = {
    key: `c${n}`, mode: 'campaign', number: n, boss,
    name: LEVEL_NAMES[w][i], layout, biome: w, seed: hashString(`campaign-${n}`),
    copies: w === 0 || (w === 1 && i < 5) ? 2 : 4,
    objective: 'clear', timeLimit: 0, parTime: 0,
    mist: 0, locks: 0, gold: 0, bombs: 0, bombMoves: 0,
    hints: [5, 4, 3, 3, 2, 2, 1, 1][w], shuffles: [3, 3, 2, 2, 2, 1, 1, 1][w], undos: -1,
  };
  // Mechanics unlock realm by realm and stack up.
  if (w >= 1) spec.mist = Math.min(0.85, (0.15 + i * 0.03 + (w - 1) * 0.08) * r);
  if (w >= 2 && (i % 3 !== 0 || boss)) { spec.objective = i % 2 === 0 && !boss ? 'clear' : 'gold'; spec.gold = 2 + Math.floor(i / 3) + (w - 2); }
  if (w === 2 && boss) spec.objective = 'clear';
  if (w >= 4) spec.locks = 2 + Math.floor(i / 2) + (w - 4);
  if (w >= 5) { spec.bombs = Math.min(3, 1 + Math.floor(i / 5) + (w - 5)); spec.bombMoves = Math.max(12, 18 - Math.floor(i / 2) - (w - 5)); }
  if (w >= 6) spec.undos = boss ? 2 : 3;
  if (boss) { spec.hints = Math.max(1, spec.hints - 1); spec.shuffles += 1; spec.mist = Math.min(0.9, spec.mist + 0.08); }
  if (spec.objective === 'gold') spec.gold = Math.min(spec.gold, Math.floor(tiles / 12));
  // Time: par and the sand clock come from a model of human solve pace,
  // tightened gradually through the campaign and by the realm's rhythm.
  const est = estimateSeconds(spec, tiles);
  const timed = w >= 3 && (i % 2 === 1 || boss || (w >= 6 && i !== 0 && i !== 5));
  if (timed) spec.timeLimit = Math.round(est * (1.75 - (w - 3) * 0.11) / r / 5) * 5;
  spec.parTime = Math.round(est * (1.05 - p * 0.2) / r);
  if (spec.timeLimit) spec.parTime = Math.min(spec.parTime, Math.round(spec.timeLimit * 0.75));
  return spec;
}

/**
 * Modelled human pace: seconds per match grow with board size (more to scan),
 * mist (less to plan with), four-of-a-kind sets, chains and bombs.
 */
export function estimateSeconds(spec: Pick<LevelSpec, 'objective' | 'mist' | 'copies' | 'locks' | 'bombs'>, tiles: number): number {
  const matches = spec.objective === 'gold' ? Math.ceil(tiles / 2 * 0.8) : tiles / 2;
  const perMatch = 2.6 + tiles / 80 + spec.mist * 1.6 + (spec.copies === 4 ? 0.6 : 0) + (spec.locks ? 0.3 : 0) + (spec.bombs ? 0.4 : 0);
  return matches * perMatch;
}

export type TierId = 'zen' | 'easy' | 'normal' | 'hard' | 'master';
export interface Tier { id: TierId; name: string; glyph: string; desc: string }
export const TIERS: Tier[] = [
  { id: 'zen', name: 'Zen', glyph: '禅', desc: 'No clock, no pressure. Unlimited hints, shuffles and undo. Every tile pair is unique.' },
  { id: 'easy', name: 'Easy', glyph: '易', desc: 'Unique pairs, 5 hints, 3 shuffles, unlimited undo.' },
  { id: 'normal', name: 'Normal', glyph: '常', desc: 'Classic four-of-a-kind sets. 3 hints, 2 shuffles, unlimited undo.' },
  { id: 'hard', name: 'Hard', glyph: '難', desc: '40% mist hides blocked faces. 1 hint, 1 shuffle, 5 undos, a few locks.' },
  { id: 'master', name: 'Master', glyph: '極', desc: 'Total mist, a ticking clock, bombs and locks. No hints, no shuffles, no undo.' },
];

export function quickLevel(layout: string, tier: TierId, biome: number, seed: number): LevelSpec {
  const tiles = layoutSize(layout);
  const base: LevelSpec = {
    key: `q-${layout}-${tier}-${seed}`, mode: 'quick', tier,
    name: `${TIERS.find(t => t.id === tier)!.name} · ${layout}`, layout, biome, seed,
    copies: 4, objective: 'clear', timeLimit: 0, parTime: Math.round(tiles * 3),
    mist: 0, locks: 0, gold: 0, bombs: 0, bombMoves: 0, hints: 3, shuffles: 2, undos: -1,
  };
  switch (tier) {
    case 'zen': return { ...base, copies: 2, hints: -1, shuffles: -1, undos: -1, parTime: tiles * 4 };
    case 'easy': return { ...base, copies: 2, hints: 5, shuffles: 3 };
    case 'normal': return base;
    case 'hard': return { ...base, mist: 0.4, hints: 1, shuffles: 1, undos: 5, locks: Math.floor(tiles / 30), parTime: Math.round(tiles * 2.6) };
    case 'master': return {
      ...base, mist: 1, hints: 0, shuffles: 0, undos: 0, locks: Math.floor(tiles / 24), bombs: Math.max(1, Math.floor(tiles / 60)),
      bombMoves: 14, timeLimit: Math.round(tiles * 3.4), parTime: Math.round(tiles * 2.2),
    };
  }
}

export function tutorialLevel(): LevelSpec {
  return {
    key: 'tutorial', mode: 'tutorial', name: 'The Tile-Keeper’s First Lesson', layout: 'petal', biome: 0, seed: 4242,
    copies: 2, objective: 'clear', timeLimit: 0, parTime: 120, mist: 0, locks: 0, gold: 0, bombs: 0, bombMoves: 0,
    hints: -1, shuffles: -1, undos: -1,
  };
}

export function biomeName(id: number) { return BIOMES[id].name; }

export function objectiveText(s: LevelSpec): string[] {
  const out: string[] = [];
  out.push(s.objective === 'gold' ? `Collect all ${s.gold} golden pairs` : 'Clear every tile from the board');
  if (s.timeLimit) out.push(`Beat the clock: ${fmtTime(s.timeLimit)}`);
  if (s.bombs) out.push(`Defuse ${s.bombs} bomb pair${s.bombs > 1 ? 's' : ''} before their fuses run out`);
  if (s.locks) out.push(`${s.locks} chained tile${s.locks > 1 ? 's' : ''} unlock as you make matches`);
  if (s.mist > 0) out.push(`Mist hides ${Math.round(s.mist * 100)}% of blocked faces`);
  if (s.objective !== 'gold' && s.gold) out.push(`${s.gold} golden pairs for bonus points`);
  return out;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
