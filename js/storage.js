// storage.js — Local persistence for favorites and settings.
// Everything lives in the viewer's own browser via localStorage; nothing
// leaves the device. All reads/writes are guarded because storage can throw
// (private mode, disabled site data) or come back empty.

const FAV_KEY = 'gcg.favorites.v1';
const SET_KEY = 'gcg.settings.v1';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// ---- Favorites ---------------------------------------------------------------
// A favorite stores the full card config (so it re-renders identically) plus
// a lightweight thumbnail data URL for the gallery grid.
export function getFavorites() {
  const list = readJSON(FAV_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorited(id) {
  return getFavorites().some(f => f.id === id);
}

export function addFavorite(fav) {
  const list = getFavorites();
  if (list.some(f => f.id === fav.id)) return list;
  list.unshift(fav);
  writeJSON(FAV_KEY, list);
  return list;
}

export function removeFavorite(id) {
  const list = getFavorites().filter(f => f.id !== id);
  writeJSON(FAV_KEY, list);
  return list;
}

export function toggleFavorite(fav) {
  return isFavorited(fav.id) ? removeFavorite(fav.id) : addFavorite(fav);
}

// ---- Settings (AI provider config) ------------------------------------------
const DEFAULT_SETTINGS = {
  useAI: false,
  endpoint: 'https://api.openai.com/v1/images/generations',
  apiKey: '',
  model: 'gpt-image-1',
};

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON(SET_KEY, {}) };
}
export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeJSON(SET_KEY, next);
  return next;
}
