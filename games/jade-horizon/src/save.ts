// Persistence: player profile (progress, stars, badges, achievements, stats, settings)
// and mid-game session snapshots (autosave + 3 manual slots). localStorage with safe fallbacks.
import type { TileData } from './engine';
import type { LevelSpec } from './levels';

export interface Settings {
  volume: number; music: boolean; sfx: boolean; quality: 'high' | 'low';
  labels: boolean; dimBlocked: boolean; showMoves: boolean; reducedMotion: boolean;
}

export interface Stats {
  matches: number; boardsCleared: number; gamesPlayed: number; quickGames: number;
  hintsUsed: number; shufflesUsed: number; undos: number; playSeconds: number; maxCombo: number;
  mistRevealed: number; goldCollected: number; bombsDefused: number; locksBroken: number;
  layoutsPlayed: string[]; retries: Record<string, number>; resumed: number; zenClears: number; masterClears: number;
  failures: number;
}

export interface Profile {
  version: 1;
  campaign: { stars: Record<string, number>; best: Record<string, { score: number; time: number }> };
  story: { unlocked: number; completed: boolean[]; ninthName: string; fragments: number[] };
  tutorialDone: boolean;
  achievements: Record<string, number>;
  badges: Record<string, number>;
  stats: Stats;
  settings: Settings;
  quick: { best: Record<string, { score: number; time: number }> };
  lastBiome: number;
}

export interface HistoryEntry { a: number; b: number; score: number; combo: number; bombs: [number, number][]; gold: boolean; bombPair: boolean }

export interface Snapshot {
  version: 1;
  savedAt: number;
  label: string;
  spec: LevelSpec;
  tiles: TileData[];
  matches: number; score: number; combo: number; maxCombo: number; elapsed: number;
  hintsLeft: number; shufflesLeft: number; undosLeft: number;
  hintsUsed: number; shufflesUsed: number; undosUsed: number;
  goldLeft: number;
  history: HistoryEntry[];
  story?: { ch: number; board: number };
}

const PROFILE_KEY = 'jadeHorizon.profile.v1';
const SLOT_KEY = (s: string) => `jadeHorizon.save.${s}`;
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'] as const;
export type Slot = typeof SLOTS[number];

export function defaultProfile(): Profile {
  return {
    version: 1,
    campaign: { stars: {}, best: {} },
    story: { unlocked: 0, completed: [], ninthName: '', fragments: [] },
    tutorialDone: false,
    achievements: {}, badges: {},
    stats: {
      matches: 0, boardsCleared: 0, gamesPlayed: 0, quickGames: 0, hintsUsed: 0, shufflesUsed: 0, undos: 0,
      playSeconds: 0, maxCombo: 0, mistRevealed: 0, goldCollected: 0, bombsDefused: 0, locksBroken: 0,
      layoutsPlayed: [], retries: {}, resumed: 0, zenClears: 0, masterClears: 0, failures: 0,
    },
    settings: { volume: 0.7, music: true, sfx: true, quality: 'high', labels: true, dimBlocked: true, showMoves: true, reducedMotion: false },
    quick: { best: {} },
    lastBiome: 0,
  };
}

let memoryStore: Record<string, string> = {};
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return memoryStore[key] ?? null; }
}
function write(key: string, value: string): boolean {
  try { localStorage.setItem(key, value); return true; } catch { memoryStore[key] = value; return false; }
}
function remove(key: string) {
  try { localStorage.removeItem(key); } catch { delete memoryStore[key]; }
}

/** Deep-merge saved data over defaults so older saves gain new fields safely. */
function merge<T>(base: T, saved: unknown): T {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved) || typeof base !== 'object' || base === null || Array.isArray(base)) {
    return (saved === undefined ? base : (saved as T));
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    out[k] = k in out ? merge((out as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

export function loadProfile(): Profile {
  const raw = read(PROFILE_KEY);
  if (!raw) return defaultProfile();
  try { return merge(defaultProfile(), JSON.parse(raw)); }
  catch (e) { console.warn('Profile corrupted, starting fresh', e); return defaultProfile(); }
}

export function saveProfile(p: Profile) { write(PROFILE_KEY, JSON.stringify(p)); }

export function saveSnapshot(slot: Slot, snap: Snapshot): boolean { return write(SLOT_KEY(slot), JSON.stringify(snap)); }

export function loadSnapshot(slot: Slot): Snapshot | null {
  const raw = read(SLOT_KEY(slot));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Snapshot;
    if (s.version !== 1 || !Array.isArray(s.tiles) || !s.spec) return null;
    return s;
  } catch { return null; }
}

export function clearSnapshot(slot: Slot) { remove(SLOT_KEY(slot)); }

export function exportAll(): string {
  const data: Record<string, unknown> = { profile: loadProfile() };
  for (const s of SLOTS) data[s] = loadSnapshot(s);
  return JSON.stringify({ game: 'jade-horizon', exportedAt: new Date().toISOString(), data }, null, 2);
}

export function importAll(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    if (parsed?.game !== 'jade-horizon' || !parsed.data?.profile) return false;
    saveProfile(merge(defaultProfile(), parsed.data.profile));
    for (const s of SLOTS) { if (parsed.data[s]) saveSnapshot(s, parsed.data[s]); else clearSnapshot(s); }
    return true;
  } catch { return false; }
}

export function resetAll() {
  remove(PROFILE_KEY);
  for (const s of SLOTS) clearSnapshot(s);
}
