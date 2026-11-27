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
}

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

export function campaignLevel(n: number): LevelSpec {
  const w = Math.floor((n - 1) / LEVELS_PER_WORLD);
  const i = (n - 1) % LEVELS_PER_WORLD;
  const boss = i === LEVELS_PER_WORLD - 1;
  const layout = WORLD_LAYOUTS[w][i];
  const tiles = layoutSize(layout);
  const p = (w * 10 + i) / (CAMPAIGN_COUNT - 1); // 0..1 global progress
  const spec: LevelSpec = {
    key: `c${n}`, mode: 'campaign', number: n, boss,
    name: LEVEL_NAMES[w][i], layout, biome: w, seed: hashString(`campaign-${n}`),
    copies: w === 0 || (w === 1 && i < 5) ? 2 : 4,
    objective: 'clear', timeLimit: 0,
    parTime: Math.round(tiles * (3.4 - p * 1.4)),
    mist: 0, locks: 0, gold: 0, bombs: 0, bombMoves: 0,
    hints: Math.max(0, 5 - w), shuffles: w < 2 ? 3 : w < 5 ? 2 : w < 7 ? 1 : 0, undos: -1,
  };
  // Mechanics unlock realm by realm and stack up.
  if (w >= 1) spec.mist = Math.min(0.85, 0.15 + i * 0.03 + (w - 1) * 0.1);
  if (w >= 2 && (i % 3 !== 0 || boss)) { spec.objective = i % 2 === 0 && !boss ? 'clear' : 'gold'; spec.gold = 2 + Math.floor(i / 3) + (w - 2); }
  if (w === 2 && boss) spec.objective = 'clear';
  if (w >= 3) spec.timeLimit = i % 2 === 1 || boss || w >= 6 ? Math.round(tiles * (4.4 - (w - 3) * 0.35 - i * 0.04)) : 0;
  if (w >= 4) spec.locks = 2 + Math.floor(i / 2) + (w - 4) * 2;
  if (w >= 5) { spec.bombs = 1 + Math.floor(i / 4) + (w - 5); spec.bombMoves = Math.max(10, 18 - i - (w - 5) * 2); }
  if (w >= 6) spec.undos = boss ? 0 : 3;
  if (boss) { spec.hints = Math.max(0, spec.hints - 1); spec.mist = Math.min(1, spec.mist + 0.1); }
  if (spec.timeLimit) spec.parTime = Math.min(spec.parTime, Math.round(spec.timeLimit * 0.7));
  if (spec.objective === 'gold') spec.gold = Math.min(spec.gold, Math.floor(tiles / 12));
  return spec;
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
