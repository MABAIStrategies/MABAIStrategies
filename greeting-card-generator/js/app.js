// app.js — UI wiring for Vibe Cards.
// Ties the catalog, procedural generator, optional AI provider and local
// storage into the mobile screens: Create, Browse, Saved, plus the full-screen
// viewer and settings sheet.

import { OCCASIONS, THEMES, PALETTES, OCCASION_MAP, THEME_MAP, PALETTE_MAP } from './data.js';
import { renderCard, buildConfig, generateBatch, CARD_W, CARD_H } from './generator.js';
import { getFavorites, isFavorited, toggleFavorite } from './storage.js';
import { getSettings, saveSettings } from './storage.js';
import { generateAIImage } from './ai.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const QUICK_VIBES = [
  'rainy cyberpunk lo-fi', 'soft botanical spring', 'gold art deco luxury',
  'dreamy pastel cosmos', 'retro sunset vaporwave', 'minimal clean elegant',
  'cozy autumn ember', 'ocean glass fresh', 'midnight starfield',
];

let lastResults = [];   // most recent batch of card objects
let viewerCard = null;  // card currently open in the viewer

// ---- rendering helpers -------------------------------------------------------
const scratch = document.createElement('canvas');

function renderProcFull(cfg) {
  renderCard(scratch, cfg);
  return scratch.toDataURL('image/png');
}
function makeThumb(srcCanvasOrImg, w = 360) {
  const h = Math.round(w * (CARD_H / CARD_W));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(srcCanvasOrImg, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.82);
}

function cfgId(cfg) {
  return `p_${cfg.occasion}_${cfg.theme}_${cfg.paletteId}_${cfg.seed}`;
}
function labelFor(cfg) {
  const occ = OCCASION_MAP[cfg.occasion]?.name || 'Card';
  const th = THEME_MAP[cfg.theme]?.name || '';
  return th ? `${occ} · ${th}` : occ;
}

// Build a card object for a procedural config (renders full + thumb).
function procCard(cfg) {
  renderCard(scratch, cfg);
  const src = scratch.toDataURL('image/png');
  const thumb = makeThumb(scratch);
  return { id: cfgId(cfg), kind: 'proc', cfg, src, thumb, name: labelFor(cfg) };
}

// ---- toast / loader ----------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1900);
}
function setLoader(on, text) {
  const el = $('#loader');
  if (text) $('#loaderText').textContent = text;
  el.hidden = !on;
}

// ---- populate static UI ------------------------------------------------------
function populateSelects() {
  const occSel = $('#occasionSelect');
  occSel.innerHTML = `<option value="">Auto</option>` +
    OCCASIONS.map(o => `<option value="${o.id}">${o.emoji} ${o.name}</option>`).join('');
  const thSel = $('#themeSelect');
  thSel.innerHTML = `<option value="">Auto (from vibe)</option>` +
    THEMES.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  const palSel = $('#paletteSelect');
  palSel.innerHTML = `<option value="">Auto (from vibe)</option>` +
    PALETTES.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function populateChips() {
  const wrap = $('#vibeChips');
  wrap.innerHTML = QUICK_VIBES.map(v => `<button class="chip" data-vibe="${v}">${v}</button>`).join('');
  wrap.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    $('#vibeInput').value = chip.dataset.vibe;
    runGenerate();
  });
}

// ---- generation --------------------------------------------------------------
function currentInputs() {
  return {
    vibe: $('#vibeInput').value.trim(),
    occasion: $('#occasionSelect').value || undefined,
    theme: $('#themeSelect').value || undefined,
    palette: $('#paletteSelect').value || undefined,
  };
}

async function runGenerate(reference = null) {
  const { vibe, occasion, theme, palette } = currentInputs();
  if (!vibe && !occasion && !theme && !reference) {
    toast('Describe a vibe or pick an occasion first');
    $('#vibeInput').focus();
    return;
  }
  const settings = getSettings();
  const configs = generateBatch({ vibe, occasion, theme, palette, reference, count: 4 });

  setLoader(true, settings.useAI ? 'Generating with AI…' : 'Composing your cards…');
  $('#emptyCreate').style.display = 'none';

  let cards = [];
  try {
    if (settings.useAI && settings.apiKey) {
      cards = await Promise.all(configs.map(async (cfg) => {
        try {
          const src = await generateAIImage(cfg, settings, reference);
          // Build a thumb from the loaded image.
          const img = await loadImage(src);
          return { id: `a_${cfg.seed}_${Math.random().toString(36).slice(2,7)}`, kind: 'ai', cfg, src, thumb: makeThumb(img), name: labelFor(cfg) };
        } catch (err) {
          console.warn('AI failed, using local render:', err);
          return procCard(cfg);
        }
      }));
      if (cards.every(c => c.kind === 'proc')) toast('AI unavailable — used instant renderer');
    } else {
      cards = configs.map(procCard);
    }
  } finally {
    setLoader(false);
  }

  lastResults = cards;
  renderResults(cards, { vibe, reference });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function renderResults(cards, { vibe, reference }) {
  const meta = $('#resultsMeta');
  meta.hidden = false;
  const what = reference ? 'Remixed batch' : (vibe ? `“${vibe}”` : 'Your batch');
  meta.innerHTML = `<strong>${what}</strong> · 4 variations · tap a card to open`;
  const grid = $('#results');
  grid.innerHTML = '';
  cards.forEach(card => grid.appendChild(tileFor(card)));
  // ensure Create screen visible & scroll to results
  switchScreen('create');
  requestAnimationFrame(() => meta.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ---- tiles -------------------------------------------------------------------
function tileFor(card) {
  const tile = document.createElement('div');
  tile.className = 'card-tile';
  const faved = isFavorited(card.id);
  tile.innerHTML = `
    <img src="${card.thumb}" alt="${card.name}" loading="lazy" />
    <button class="fav-toggle ${faved ? 'on' : ''}" aria-label="Save">${faved ? '❤️' : '🤍'}</button>
    <span class="tile-tag">${card.name}</span>`;
  tile.querySelector('img').addEventListener('click', () => openViewer(card));
  tile.querySelector('.tile-tag').addEventListener('click', () => openViewer(card));
  tile.querySelector('.fav-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    onToggleFav(card, e.currentTarget);
  });
  return tile;
}

function onToggleFav(card, btnEl) {
  const favRecord = {
    id: card.id, kind: card.kind, name: card.name, thumb: card.thumb,
    cfg: card.kind === 'proc' ? card.cfg : undefined,
    src: card.kind === 'ai' ? card.src : undefined,
  };
  const list = toggleFavorite(favRecord);
  const nowFaved = list.some(f => f.id === card.id);
  if (btnEl) { btnEl.classList.toggle('on', nowFaved); btnEl.textContent = nowFaved ? '❤️' : '🤍'; }
  toast(nowFaved ? 'Saved to favorites' : 'Removed from favorites');
  updateFavCount();
  if ($('#screen-favorites').classList.contains('is-active')) renderFavorites();
  // keep viewer heart in sync
  if (viewerCard && viewerCard.id === card.id) syncViewerFav();
}

// ---- viewer ------------------------------------------------------------------
function openViewer(card) {
  viewerCard = card;
  $('#viewerImg').src = card.src;
  syncViewerFav();
  const v = $('#viewer');
  v.hidden = false;
}
function closeViewer() { $('#viewer').hidden = true; viewerCard = null; }
function syncViewerFav() {
  const btn = $('#viewerFav');
  const on = viewerCard && isFavorited(viewerCard.id);
  btn.classList.toggle('on', !!on);
  btn.textContent = on ? '❤️ Saved' : '🤍 Save';
}

function downloadCurrent() {
  if (!viewerCard) return;
  const a = document.createElement('a');
  a.href = viewerCard.src;
  a.download = `vibe-card-${viewerCard.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Downloading…');
}

function remixCurrent() {
  if (!viewerCard || !viewerCard.cfg) { toast('This card cannot be remixed'); return; }
  const ref = viewerCard.cfg;
  closeViewer();
  // Reflect the reference vibe in the input for transparency.
  if (ref.vibe) $('#vibeInput').value = ref.vibe;
  toast('Remixing from this card…');
  runGenerate(ref);
}

// ---- favorites screen --------------------------------------------------------
function updateFavCount() {
  const n = getFavorites().length;
  $('#favCount').textContent = String(n);
}
function renderFavorites() {
  const grid = $('#favGrid');
  const favs = getFavorites();
  grid.innerHTML = '';
  favs.forEach(f => {
    // Reconstitute a card object usable by the viewer.
    let card;
    if (f.kind === 'proc' && f.cfg) {
      card = procCard(f.cfg); // full-res regenerated deterministically
      card.thumb = f.thumb || card.thumb;
    } else {
      card = { id: f.id, kind: f.kind, name: f.name, thumb: f.thumb, src: f.src || f.thumb, cfg: f.cfg };
    }
    grid.appendChild(tileFor(card));
  });
  updateFavCount();
}

// ---- browse screen -----------------------------------------------------------
let browseTab = 'occasions';
function renderBrowse() {
  const grid = $('#browseGrid');
  grid.innerHTML = '';
  if (browseTab === 'occasions') {
    OCCASIONS.forEach(o => {
      const pal = PALETTES[(o.name.length) % PALETTES.length].colors;
      const card = document.createElement('button');
      card.className = 'browse-card';
      card.style.background = `linear-gradient(135deg, ${pal[1]}, ${pal[3]})`;
      card.innerHTML = `<span class="bc-emoji">${o.emoji}</span><span class="bc-name">${o.name}</span>`;
      card.addEventListener('click', () => {
        $('#occasionSelect').value = o.id;
        $('#vibeInput').value = '';
        runGenerate();
      });
      grid.appendChild(card);
    });
  } else if (browseTab === 'themes') {
    THEMES.forEach(t => {
      const pal = PALETTE_MAP[
        (['neon-noir','cotton-candy','sage-cream','blush-rose','ember','ocean-glass','forest-fog','grape-soda','sunset-pop','midnight-gold'][THEMES.indexOf(t) % 10])
      ]?.colors || PALETTES[0].colors;
      const card = document.createElement('button');
      card.className = 'browse-card';
      card.style.background = `linear-gradient(135deg, ${pal[0]}, ${pal[2]})`;
      card.innerHTML = `<span class="bc-name">${t.name}</span>
        <span class="muted small">${t.keywords.slice(0,3).join(' · ')}</span>`;
      card.addEventListener('click', () => {
        $('#themeSelect').value = t.id;
        runGenerate();
      });
      grid.appendChild(card);
    });
  } else {
    PALETTES.forEach(p => {
      const card = document.createElement('button');
      card.className = 'browse-card';
      card.style.background = `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`;
      card.innerHTML = `<span class="bc-name">${p.name}</span>
        <span class="bc-swatches">${p.colors.map(c => `<i style="background:${c}"></i>`).join('')}</span>`;
      card.addEventListener('click', () => {
        $('#paletteSelect').value = p.id;
        runGenerate();
      });
      grid.appendChild(card);
    });
  }
}

// ---- navigation --------------------------------------------------------------
function switchScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === `screen-${name}`));
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.screen === name));
  if (name === 'favorites') renderFavorites();
  if (name === 'browse') renderBrowse();
  window.scrollTo({ top: 0 });
}

// ---- settings ----------------------------------------------------------------
function openSettings() {
  const s = getSettings();
  $('#setUseAI').checked = s.useAI;
  $('#setEndpoint').value = s.endpoint;
  $('#setModel').value = s.model;
  $('#setApiKey').value = s.apiKey;
  $('#aiFields').classList.toggle('disabled', !s.useAI);
  $('#settingsModal').hidden = false;
}
function closeSettings() { $('#settingsModal').hidden = true; }

// ---- wire up -----------------------------------------------------------------
function init() {
  populateSelects();
  populateChips();
  updateFavCount();

  $('#generateBtn').addEventListener('click', () => runGenerate());
  $('#vibeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') runGenerate(); });
  $('#diceBtn').addEventListener('click', () => {
    $('#vibeInput').value = QUICK_VIBES[Math.floor(Math.random() * QUICK_VIBES.length)];
    $('#occasionSelect').value = OCCASIONS[Math.floor(Math.random() * OCCASIONS.length)].id;
    runGenerate();
  });

  $$('.tab').forEach(t => t.addEventListener('click', () => switchScreen(t.dataset.screen)));

  $$('.browse-tab').forEach(t => t.addEventListener('click', () => {
    browseTab = t.dataset.tab;
    $$('.browse-tab').forEach(x => x.classList.toggle('is-active', x === t));
    renderBrowse();
  }));

  // viewer
  $('#viewerClose').addEventListener('click', closeViewer);
  $('#viewer').addEventListener('click', (e) => { if (e.target.id === 'viewer') closeViewer(); });
  $('#viewerDownload').addEventListener('click', downloadCurrent);
  $('#viewerRemix').addEventListener('click', remixCurrent);
  $('#viewerFav').addEventListener('click', () => { if (viewerCard) onToggleFav(viewerCard, null); });

  // settings
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsModal').addEventListener('click', (e) => { if (e.target.id === 'settingsModal') closeSettings(); });
  $('#setUseAI').addEventListener('change', (e) => $('#aiFields').classList.toggle('disabled', !e.target.checked));
  $('#settingsSave').addEventListener('click', () => {
    saveSettings({
      useAI: $('#setUseAI').checked,
      endpoint: $('#setEndpoint').value.trim() || 'https://api.openai.com/v1/images/generations',
      model: $('#setModel').value.trim() || 'gpt-image-1',
      apiKey: $('#setApiKey').value.trim(),
    });
    closeSettings();
    toast('Settings saved');
  });

  // Escape closes overlays
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#viewer').hidden) closeViewer();
    else if (!$('#settingsModal').hidden) closeSettings();
  });
}

init();
