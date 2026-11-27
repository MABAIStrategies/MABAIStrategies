// 50 achievements + realm/star badges, evaluated against the saved profile and the last game.
import type { Profile } from './save';
import type { LevelSpec } from './levels';
import { CAMPAIGN_COUNT, LEVELS_PER_WORLD } from './levels';
import { BIOMES } from './biomes';
import { CHAPTERS } from './story';

export interface GameResult {
  spec: LevelSpec; won: boolean; score: number; time: number; maxCombo: number;
  hintsUsed: number; shufflesUsed: number; undosUsed: number; stuckShuffle: boolean;
  winds: number[]; dragonStreak: number; flower: boolean; season: boolean; tiles: number;
}

export interface Achievement {
  id: string; name: string; desc: string; glyph: string;
  check: (p: Profile, r?: GameResult) => boolean;
  progress?: (p: Profile) => [number, number];
}

const totalStars = (p: Profile) => Object.values(p.campaign.stars).reduce((a, b) => a + b, 0);
const threeStars = (p: Profile) => Object.values(p.campaign.stars).filter(s => s >= 3).length;
const worldDone = (p: Profile, w: number) => (p.campaign.stars[`c${(w + 1) * LEVELS_PER_WORLD}`] ?? 0) > 0;
const won = (r?: GameResult) => !!r && r.won;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_match', name: 'First Pair', desc: 'Make your first match.', glyph: '一', check: p => p.stats.matches >= 1 },
  { id: 'first_clear', name: 'Clean Slate', desc: 'Win any board.', glyph: '清', check: p => p.stats.boardsCleared >= 1 },
  { id: 'apprentice', name: 'Apprentice', desc: 'Complete the tutorial.', glyph: '徒', check: p => p.tutorialDone },
  { id: 'combo3', name: 'Rhythm', desc: 'Reach a 3x combo.', glyph: '三', check: p => p.stats.maxCombo >= 3 },
  { id: 'combo5', name: 'Flow State', desc: 'Reach a 5x combo.', glyph: '五', check: p => p.stats.maxCombo >= 5 },
  { id: 'combo10', name: 'Unstoppable', desc: 'Reach a 10x combo.', glyph: '十', check: p => p.stats.maxCombo >= 10 },
  { id: 'speed60', name: 'Quick Hands', desc: 'Win a board in under 60 seconds.', glyph: '速', check: (_p, r) => won(r) && r!.time < 60 },
  { id: 'lightning', name: 'Lightning Shell', desc: 'Win a 144-tile board in under 6 minutes.', glyph: '雷', check: (_p, r) => won(r) && r!.tiles >= 144 && r!.time < 360 },
  { id: 'purist', name: 'Purist', desc: 'Win without using a hint.', glyph: '純', check: (_p, r) => won(r) && r!.hintsUsed === 0 },
  { id: 'no_net', name: 'No Safety Net', desc: 'Win with no hints, shuffles or undos.', glyph: '勇', check: (_p, r) => won(r) && r!.hintsUsed + r!.shufflesUsed + r!.undosUsed === 0 },
  { id: 'clears10', name: 'Tile Sweeper', desc: 'Win 10 boards.', glyph: '掃', check: p => p.stats.boardsCleared >= 10, progress: p => [p.stats.boardsCleared, 10] },
  { id: 'clears50', name: 'Board Master', desc: 'Win 50 boards.', glyph: '盤', check: p => p.stats.boardsCleared >= 50, progress: p => [p.stats.boardsCleared, 50] },
  { id: 'matches100', name: 'Hundred Pairs', desc: 'Make 100 matches.', glyph: '百', check: p => p.stats.matches >= 100, progress: p => [p.stats.matches, 100] },
  { id: 'matches1000', name: 'Thousand Pairs', desc: 'Make 1,000 matches.', glyph: '千', check: p => p.stats.matches >= 1000, progress: p => [p.stats.matches, 1000] },
  { id: 'matches5000', name: 'Myriad Pairs', desc: 'Make 5,000 matches.', glyph: '萬', check: p => p.stats.matches >= 5000, progress: p => [p.stats.matches, 5000] },
  { id: 'stars10', name: 'Star Gazer', desc: 'Earn 10 campaign stars.', glyph: '星', check: p => totalStars(p) >= 10, progress: p => [totalStars(p), 10] },
  { id: 'stars60', name: 'Constellation', desc: 'Earn 60 campaign stars.', glyph: '宿', check: p => totalStars(p) >= 60, progress: p => [totalStars(p), 60] },
  { id: 'stars150', name: 'Milky Way', desc: 'Earn 150 campaign stars.', glyph: '河', check: p => totalStars(p) >= 150, progress: p => [totalStars(p), 150] },
  { id: 'stars240', name: 'Full Heavens', desc: 'Earn all 240 campaign stars.', glyph: '天', check: p => totalStars(p) >= CAMPAIGN_COUNT * 3, progress: p => [totalStars(p), CAMPAIGN_COUNT * 3] },
  { id: 'perfect10', name: 'Perfectionist', desc: 'Earn 3 stars on 10 levels.', glyph: '完', check: p => threeStars(p) >= 10, progress: p => [threeStars(p), 10] },
  ...BIOMES.map((b, w) => ({
    id: `world${w + 1}`, name: `${b.name}`, desc: `Defeat the realm boss of ${b.name}.`, glyph: ['春', '竹', '燈', '沙', '冰', '楓', '火', '星'][w],
    check: (p: Profile) => worldDone(p, w),
  })),
  { id: 'mist50', name: 'Mist Walker', desc: 'Reveal 50 mist-veiled tiles.', glyph: '霧', check: p => p.stats.mistRevealed >= 50, progress: p => [p.stats.mistRevealed, 50] },
  { id: 'gold25', name: 'Gold Rush', desc: 'Collect 25 golden pairs.', glyph: '金', check: p => p.stats.goldCollected >= 25, progress: p => [p.stats.goldCollected, 25] },
  { id: 'bomb20', name: 'Bomb Squad', desc: 'Defuse 20 bomb pairs.', glyph: '爆', check: p => p.stats.bombsDefused >= 20, progress: p => [p.stats.bombsDefused, 20] },
  { id: 'lock30', name: 'Chain Breaker', desc: 'Break 30 chains.', glyph: '鎖', check: p => p.stats.locksBroken >= 30, progress: p => [p.stats.locksBroken, 30] },
  { id: 'story1', name: 'Color Returns', desc: 'Finish Story Chapter I.', glyph: '色', check: p => !!p.story.completed[0] },
  { id: 'story4', name: 'Halfway Wind', desc: 'Finish Story Chapter IV.', glyph: '半', check: p => !!p.story.completed[3] },
  { id: 'story8', name: 'The Ninth Wind', desc: 'Finish the story and name the Ninth Wind.', glyph: '九', check: p => !!p.story.completed[CHAPTERS.length - 1] },
  { id: 'lore', name: 'Lore Keeper', desc: 'Collect every memory fragment.', glyph: '書', check: p => p.story.fragments.length >= CHAPTERS.length, progress: p => [p.story.fragments.length, CHAPTERS.length] },
  { id: 'quick10', name: 'Pick-Up Player', desc: 'Play 10 Quick Games.', glyph: '快', check: p => p.stats.quickGames >= 10, progress: p => [p.stats.quickGames, 10] },
  { id: 'zen', name: 'Inner Calm', desc: 'Win a Zen board.', glyph: '禅', check: p => p.stats.zenClears >= 1 },
  { id: 'master', name: 'Master of Tiles', desc: 'Win on Master difficulty.', glyph: '極', check: p => p.stats.masterClears >= 1 },
  { id: 'night', name: 'Night Owl', desc: 'Win a board between midnight and 4 AM.', glyph: '夜', check: (_p, r) => won(r) && new Date().getHours() < 4 },
  { id: 'dragons', name: 'Dragon Tamer', desc: 'Match three dragon pairs in a row.', glyph: '龍', check: (_p, r) => !!r && r.dragonStreak >= 3 },
  { id: 'winds', name: 'Four Winds', desc: 'Match all four winds in a single game.', glyph: '風', check: (_p, r) => !!r && new Set(r.winds).size >= 4 },
  { id: 'seasons', name: 'Seasons Turn', desc: 'Match a flower pair and a season pair in one game.', glyph: '季', check: (_p, r) => !!r && r.flower && r.season },
  { id: 'comeback', name: 'Comeback', desc: 'Win after shuffling out of a dead end.', glyph: '轉', check: (_p, r) => won(r) && r!.stuckShuffle },
  { id: 'undo25', name: 'Second Thoughts', desc: 'Undo 25 moves.', glyph: '悔', check: p => p.stats.undos >= 25, progress: p => [p.stats.undos, 25] },
  { id: 'persist', name: 'Persistence', desc: 'Retry the same level 5 times.', glyph: '恆', check: p => Object.values(p.stats.retries).some(n => n >= 5) },
  { id: 'marathon', name: 'Marathon', desc: 'Play for a total of 60 minutes.', glyph: '時', check: p => p.stats.playSeconds >= 3600, progress: p => [Math.floor(p.stats.playSeconds / 60), 60] },
  { id: 'resume', name: 'Where Was I?', desc: 'Resume a saved game.', glyph: '續', check: p => p.stats.resumed >= 1 },
  { id: 'explorer', name: 'Cartographer', desc: 'Play on 10 different layouts.', glyph: '圖', check: p => p.stats.layoutsPlayed.length >= 10, progress: p => [p.stats.layoutsPlayed.length, 10] },
  { id: 'grandmaster', name: 'Grandmaster', desc: 'Win the Turtle on Master difficulty.', glyph: '宗', check: (_p, r) => won(r) && r!.spec.tier === 'master' && r!.spec.layout === 'turtle' },
];

export interface Badge { id: string; name: string; desc: string; glyph: string; color: string; earned: (p: Profile) => boolean }

export const BADGES: Badge[] = [
  { id: 'seal_apprentice', name: 'Apprentice Seal', desc: 'Completed the Tile-Keeper’s lesson.', glyph: '徒', color: '#1f7a58', earned: p => p.tutorialDone },
  ...BIOMES.map((b, w) => ({
    id: `realm_${b.key}`, name: `${b.name} Crest`, desc: `Cleared all 10 levels of ${b.name}.`, glyph: ['春', '竹', '燈', '沙', '冰', '楓', '火', '星'][w], color: b.accent,
    earned: (p: Profile) => Array.from({ length: LEVELS_PER_WORLD }, (_, i) => p.campaign.stars[`c${w * LEVELS_PER_WORLD + i + 1}`] ?? 0).every(s => s > 0),
  })),
  { id: 'stars_bronze', name: 'Bronze Lantern', desc: '60 campaign stars.', glyph: '銅', color: '#b0703a', earned: p => totalStars(p) >= 60 },
  { id: 'stars_silver', name: 'Silver Lantern', desc: '150 campaign stars.', glyph: '銀', color: '#a8b4c4', earned: p => totalStars(p) >= 150 },
  { id: 'stars_gold', name: 'Golden Lantern', desc: 'All 240 campaign stars.', glyph: '金', color: '#e0b43a', earned: p => totalStars(p) >= 240 },
  { id: 'story', name: 'Lantern Bearer', desc: 'Relit the Great Lantern.', glyph: '燈', color: '#ff9a3a', earned: p => !!p.story.completed[CHAPTERS.length - 1] },
  { id: 'master', name: 'Master’s Mark', desc: 'Won on Master difficulty.', glyph: '極', color: '#c0392b', earned: p => p.stats.masterClears > 0 },
  { id: 'achiever', name: 'Hall of Winds', desc: 'Unlocked 25 achievements.', glyph: '殿', color: '#7a6aa8', earned: p => Object.keys(p.achievements).length >= 25 },
];

/** Returns newly unlocked achievements and badges, recording them in the profile. */
export function evaluate(p: Profile, r?: GameResult): { achievements: Achievement[]; badges: Badge[] } {
  const now = Date.now();
  const newA = ACHIEVEMENTS.filter(a => !p.achievements[a.id] && safe(() => a.check(p, r)));
  newA.forEach(a => { p.achievements[a.id] = now; });
  const newB = BADGES.filter(b => !p.badges[b.id] && safe(() => b.earned(p)));
  newB.forEach(b => { p.badges[b.id] = now; });
  return { achievements: newA, badges: newB };
}

function safe(f: () => boolean): boolean {
  try { return f(); } catch (e) { console.warn('achievement check failed', e); return false; }
}
