// App shell: screens, navigation, HUD, dialogue, progression and saving.
import * as THREE from 'three';
import { Stage } from './stage';
import { BoardView } from './boardview';
import { FaceAtlas, faceName } from './faces';
import { Game, EndInfo, HudState } from './game';
import { BIOMES } from './biomes';
import { LAYOUTS, LAYOUT_BY_ID } from './layouts';
import {
  campaignLevel, quickLevel, tutorialLevel, objectiveText, fmtTime, TIERS, TierId,
  CAMPAIGN_COUNT, LEVELS_PER_WORLD, CAMPAIGN_WORLDS, LevelSpec, withBlessing, BLESSING_TEXT,
} from './levels';
import { CHAPTERS, CAST, storyLevel, fillName, Line } from './story';
import {
  Profile, LevelStat, loadProfile, saveProfile, saveSnapshot, loadSnapshot, clearSnapshot, Snapshot, Slot, SLOTS,
  exportAll, importAll, resetAll,
} from './save';
import { ACHIEVEMENTS, BADGES, evaluate, Achievement, Badge } from './achievements';
import { audio } from './audio';
import { TUTORIAL_STEPS } from './tutorial';
import type { Pos } from './engine';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const ICON = {
  hint: '<svg viewBox="0 0 24 24"><path d="M9 21h6M10 17h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  center: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
};

export class App {
  profile: Profile;
  stage: Stage;
  atlas: FaceAtlas;
  view: BoardView;
  game: Game | null = null;
  private ui = $('#ui');
  private hud = $('#hud');
  private toasts = $('#toasts');
  private popups = $('#popups');
  private veilEl = $('#veil');
  private exportBtn = $('#exportCode');
  private hudRefs: Record<string, HTMLElement> = {};
  private lastCounters = { mistRevealed: 0, goldCollected: 0, bombsDefused: 0, locksBroken: 0, matches: 0 };
  private tutStep = -1;
  private screen = '';
  private dialogueActive = false;
  private source = '';

  constructor(canvas: HTMLCanvasElement, source: string) {
    this.source = source;
    this.profile = loadProfile();
    const s = this.profile.settings;
    this.stage = new Stage(canvas, s.quality);
    this.atlas = new FaceAtlas(s.labels, this.stage.renderer.capabilities.getMaxAnisotropy());
    this.view = new BoardView(this.stage, this.atlas);
    this.view.dimBlocked = s.dimBlocked;
    this.view.portraitTurn = s.portraitTurn;
    this.view.safeInsets = () => this.hudInsets();
    audio.volume = s.volume; audio.sfxOn = s.sfx; audio.musicOn = s.music;
    this.stage.setBiome(this.profile.lastBiome ?? 0, true);
    this.stage.setCinematic(true);
    this.stage.onFrame.push(dt => this.game?.tick(dt));
    this.watchScreenShape();
    this.bindGlobal();
    this.exportBtn.addEventListener('click', () => this.exportCode());
  }

  // ======================= global input =======================
  private bindGlobal() {
    const unlock = () => { audio.unlock(); audio.setMood(this.stage.biome.id); };
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', e => {
      audio.unlock();
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (this.dialogueActive) return;
      const g = this.game;
      if (!g || !g.running) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') { e.preventDefault(); if (g.paused) this.closeModal(); else this.pauseMenu(); return; }
      if (g.paused) return;
      if (k === 'h') g.hint();
      else if (k === 's') g.shuffle();
      else if (k === 'z' || (e.ctrlKey && k === 'z')) g.undo();
      else if (k === 'r') this.recenter();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.game.ended) {
        if (!this.game.paused && this.game.running) this.pauseMenu();
        this.game.saveNow();
      }
    });
    window.addEventListener('beforeunload', () => this.game?.saveNow());
  }

  // ======================= helpers =======================
  private saveProfile() { saveProfile(this.profile); }

  private async veil(fn: () => void | Promise<void>, color = '#0b0d12') {
    this.veilEl.style.background = color;
    this.veilEl.classList.add('on');
    await new Promise(r => setTimeout(r, this.profile.settings.reducedMotion ? 60 : 380));
    await fn();
    await new Promise(r => requestAnimationFrame(() => r(null)));
    this.veilEl.classList.remove('on');
  }

  private setScreen(name: string, html: string, cls = '') {
    this.screen = name;
    this.ui.innerHTML = `<div class="screen ${cls ? 'scr-' + cls : ''}" data-screen="${name}">${html}</div>`;
    this.ui.classList.remove('hidden');
    this.exportBtn.classList.toggle('hidden', !['title', 'settings'].includes(name));
    this.ui.querySelectorAll('[data-sfx]').forEach(b => b.addEventListener('click', () => audio.play('ui')));
  }

  private on(sel: string, fn: (el: HTMLElement, e: Event) => void, root: ParentNode = this.ui) {
    root.querySelectorAll<HTMLElement>(sel).forEach(el => el.addEventListener('click', e => { audio.unlock(); audio.play('ui'); fn(el, e); }));
  }

  private modal(html: string, cls = '', dismissable = true): HTMLElement {
    this.closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal ${cls}">${html}</div>`;
    if (dismissable) wrap.addEventListener('click', e => { if (e.target === wrap) this.closeModal(); });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return wrap;
  }

  private closeModal() {
    document.querySelectorAll('.modal-wrap').forEach(m => m.remove());
    if (this.game && this.game.paused && !this.game.ended && !this.dialogueActive) this.game.setPaused(false);
  }

  toast(msg: string, kind: 'info' | 'warn' | 'good' | 'ach' = 'info', glyph = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = glyph ? `<span class="tglyph">${glyph}</span><div>${msg}</div>` : `<div>${msg}</div>`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'ach' ? 4200 : 2600);
  }

  private popup(text: string, at: THREE.Vector3, color: string) {
    const v = at.clone().project(this.stage.camera);
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${(v.x + 1) / 2 * window.innerWidth}px`;
    el.style.top = `${(1 - v.y) / 2 * window.innerHeight}px`;
    this.popups.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  private medallion(glyph: string, color: string, locked = false, size = '') {
    return `<span class="medal ${locked ? 'locked' : ''} ${size}" style="--mc:${color}"><span>${locked ? '?' : glyph}</span></span>`;
  }

  private totalStars() { return Object.values(this.profile.campaign.stars).reduce((a, b) => a + b, 0); }
  private highestUnlocked() {
    let n = 1;
    while (n < CAMPAIGN_COUNT && (this.profile.campaign.stars[`c${n}`] ?? 0) > 0) n++;
    return n;
  }

  private async goBiome(id: number, withVeil = true) {
    if (this.stage.biome.id === id) return;
    this.profile.lastBiome = id; this.saveProfile();
    audio.setMood(id);
    if (withVeil) await this.veil(() => this.stage.setBiome(id));
    else this.stage.setBiome(id);
  }

  // ======================= TITLE =======================
  title() {
    this.hideHud();
    this.stage.setCinematic(true);
    this.stage.saturation = 1;
    const auto = loadSnapshot('auto');
    const b = this.stage.biome;
    const stars = this.totalStars();
    const ach = Object.keys(this.profile.achievements).length;
    this.setScreen('title', `
      <div class="title-wrap">
        <div class="logo">
          <div class="logo-tiles"><span>翡</span><span>翠</span></div>
          <h1>Jade Horizon</h1>
          <p class="tag">A Mahjong Odyssey across the Eight Realms</p>
        </div>
        <nav class="menu">
          ${auto ? `<button class="btn primary big" data-a="continue">Continue<small>${esc(auto.label)} · ${Math.round(100 - auto.tiles.filter(t => !t.removed).length / auto.tiles.length * 100)}% cleared</small></button>` : ''}
          <button class="btn ${auto ? '' : 'primary'} big" data-a="story">Story<small>The Lantern of Eight Winds</small></button>
          <button class="btn big" data-a="campaign">Campaign<small>${stars}/${CAMPAIGN_COUNT * 3} ★ · ${CAMPAIGN_COUNT} levels</small></button>
          <button class="btn big" data-a="quick">Quick Play<small>Pick up and play</small></button>
          <div class="menu-row">
            <button class="btn" data-a="tutorial">${this.profile.tutorialDone ? 'Tutorial' : 'Tutorial ✦'}</button>
            <button class="btn" data-a="load">Load Game</button>
          </div>
          <div class="menu-row">
            <button class="btn" data-a="achievements">Achievements <b>${ach}/50</b></button>
            <button class="btn" data-a="profile">Badges &amp; Stats</button>
          </div>
          <button class="btn ghost" data-a="settings">Settings</button>
        </nav>
        <div class="realm-chip" style="--c:${b.accent}">${b.name} — <i>${b.subtitle}</i></div>
      </div>`, 'title');
    this.on('[data-a]', el => {
      const a = el.dataset.a!;
      if (a === 'continue' && auto) this.resume(auto, 'auto');
      if (a === 'story') this.storyMenu();
      if (a === 'campaign') this.campaignMap();
      if (a === 'quick') this.quickPlay();
      if (a === 'tutorial') this.startTutorial();
      if (a === 'load') this.loadScreen();
      if (a === 'achievements') this.achievementsScreen();
      if (a === 'profile') this.profileScreen();
      if (a === 'settings') this.settings();
    });
    if (!this.profile.tutorialDone && !auto && this.profile.stats.gamesPlayed === 0) {
      setTimeout(() => this.toast('New here? Try the <b>Tutorial</b> first — it takes two minutes.', 'info', '徒'), 1200);
    }
  }

  private header(title: string, sub = '') {
    return `<header class="bar"><button class="icon-btn" data-back>${ICON.back}</button><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div></header>`;
  }
  private bindBack(fn: () => void = () => this.title()) { this.on('[data-back]', () => fn()); }

  // ======================= CAMPAIGN MAP =======================
  campaignMap(focus?: number) {
    this.hideHud();
    this.stage.setCinematic(true);
    const current = this.highestUnlocked();
    const target = focus ?? current;
    let html = this.header('Campaign', `${this.totalStars()} / ${CAMPAIGN_COUNT * 3} stars`) + '<div class="map" id="map">';
    for (let w = CAMPAIGN_WORLDS - 1; w >= 0; w--) {
      const b = BIOMES[w];
      const wStars = Array.from({ length: LEVELS_PER_WORLD }, (_, i) => this.profile.campaign.stars[`c${w * 10 + i + 1}`] ?? 0).reduce((a, c) => a + c, 0);
      const nodes: string[] = [];
      const pts: [number, number][] = [];
      for (let i = LEVELS_PER_WORLD - 1; i >= 0; i--) {
        const n = w * 10 + i + 1;
        const row = LEVELS_PER_WORLD - 1 - i;
        const x = 50 + Math.sin(n * 0.85) * 30;
        const y = 70 + row * 92;
        pts.push([x, y]);
        const st = this.profile.campaign.stars[`c${n}`] ?? 0;
        const unlocked = n <= current;
        const spec = campaignLevel(n);
        nodes.push(`<button class="node ${unlocked ? '' : 'locked'} ${n === current ? 'current' : ''} ${spec.boss ? 'boss' : ''}" data-n="${n}" style="left:${x}%;top:${y}px" ${unlocked ? '' : 'disabled'}>
          <span class="num ${unlocked ? '' : 'lk'}">${unlocked ? n : '鎖'}</span>
          <span class="stars">${[0, 1, 2].map(k => `<i class="${k < st ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>
          ${spec.boss ? '<span class="crown">BOSS</span>' : ''}
        </button>`);
      }
      const h = 70 + LEVELS_PER_WORLD * 92;
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
      html += `<section class="world" data-w="${w}" style="--c:${b.accent};--c2:${b.accent2}">
        <div class="world-head">${this.medallion(['春', '竹', '燈', '沙', '冰', '楓', '火', '星'][w], b.accent, false, 'sm')}<div><h3>${w + 1}. ${b.name}</h3><p>${b.subtitle} · ${wStars}/30 ★</p></div></div>
        <div class="trail" style="height:${h}px">
          <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none"><path d="${path}" vector-effect="non-scaling-stroke"/></svg>
          ${nodes.join('')}
        </div></section>`;
    }
    html += '</div>';
    this.setScreen('campaign', html, 'campaign');
    this.bindBack();
    this.on('.node:not(.locked)', el => this.levelIntro(Number(el.dataset.n)));
    const map = $('#map');
    const node = map.querySelector(`[data-n="${target}"]`) as HTMLElement | null;
    if (node) requestAnimationFrame(() => node.scrollIntoView({ block: 'center' }));
    // Switch the 3D realm to match the region in view
    let pending: number | null = null, timer = 0;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.35) {
        pending = Number((e.target as HTMLElement).dataset.w);
        clearTimeout(timer);
        timer = window.setTimeout(() => { if (pending !== null && this.screen === 'campaign') this.goBiome(pending); }, 450);
      }
    }, { root: map, threshold: [0.35, 0.6] });
    map.querySelectorAll('.world').forEach(s => io.observe(s));
  }

  levelIntro(n: number) {
    const spec = campaignLevel(n);
    const st = this.profile.campaign.stars[spec.key] ?? 0;
    const best = this.profile.campaign.best[spec.key];
    const L = LAYOUT_BY_ID[spec.layout];
    const m = this.modal(`
      <div class="lvl-head" style="--c:${BIOMES[spec.biome].accent}">
        <div class="lvl-num">${spec.boss ? 'BOSS · ' : ''}Level ${n}</div>
        <h2>${spec.name}</h2>
        <p>${BIOMES[spec.biome].name} · ${L.name} · ${L.positions.length} tiles</p>
      </div>
      <div class="lvl-body">
        <div class="preview">${this.layoutSvg(L.positions)}</div>
        <ul class="objectives">${objectiveText(spec).map(o => `<li>${o}</li>`).join('')}</ul>
        <div class="star-rules">
          <div><i class="${st >= 1 ? 'on' : ''}">${ICON.star}</i> Win the level</div>
          <div><i class="${st >= 2 ? 'on' : ''}">${ICON.star}</i> Finish within ${fmtTime(spec.parTime)}</div>
          <div><i class="${st >= 3 ? 'on' : ''}">${ICON.star}</i> No hints, undos or manual shuffles</div>
        </div>
        <div class="kit">Hints <b>${spec.hints < 0 ? '∞' : spec.hints}</b> · Shuffles <b>${spec.shuffles < 0 ? '∞' : spec.shuffles}</b> · Undo <b>${spec.undos < 0 ? '∞' : spec.undos}</b></div>
        ${best ? `<div class="best">Best: ${best.score.toLocaleString()} pts · ${fmtTime(best.time)}</div>` : ''}
        ${this.recordLine(spec)}
        ${this.blessingBox(spec)}
      </div>
      <div class="modal-actions"><button class="btn ghost" data-x>Back</button><button class="btn primary" data-go>Play</button></div>`, 'lvl');
    this.on('[data-x]', () => this.closeModal(), m);
    this.on('[data-go]', () => { this.closeModal(); this.play(this.blessed(m) ? withBlessing(spec) : spec); }, m);
  }

  // ======================= telemetry & blessing =======================
  /** Stats key: one per level (quick play groups by board + tier, ignoring the random seed). */
  private statKey(spec: LevelSpec) { return spec.mode === 'quick' ? `q-${spec.layout}-${spec.tier}` : spec.key; }

  private levelStat(spec: LevelSpec): LevelStat {
    const k = this.statKey(spec);
    return (this.profile.levelStats[k] ??= { attempts: 0, wins: 0, losses: {}, failStreak: 0, bestTime: 0, totalTime: 0, assistedWins: 0, lastPlayed: 0 });
  }

  private recordLine(spec: LevelSpec): string {
    const st = this.profile.levelStats[this.statKey(spec)];
    if (!st || !st.attempts) return '';
    const causes: Record<string, string> = { bomb: 'bomb', clock: 'clock', stuck: 'no moves' };
    const losses = Object.entries(st.losses).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${causes[k] ?? k} ×${v}`).join(', ');
    return `<div class="record">Your record: ${st.attempts} attempt${st.attempts > 1 ? 's' : ''} · ${st.wins} win${st.wins === 1 ? '' : 's'}${losses ? ` · lost to ${losses}` : ''}</div>`;
  }

  private blessingBox(spec: LevelSpec): string {
    const st = this.profile.levelStats[this.statKey(spec)];
    if (!st || st.failStreak < 3 || spec.mode === 'tutorial') return '';
    return `<label class="blessing"><input type="checkbox" checked data-bless><span>${this.medallion('燈', '#ff9a3a', false, 'sm')}</span>
      <span><b>Accept the Lantern\u2019s Blessing</b><small>This level has beaten you ${st.failStreak} times in a row. For your next try: ${BLESSING_TEXT}.</small></span></label>`;
  }

  private blessed(root: ParentNode): boolean {
    return !!root.querySelector<HTMLInputElement>('[data-bless]')?.checked;
  }

  /** The level as designed, without any blessing applied. */
  private baseSpec(spec: LevelSpec, story?: { ch: number; board: number }): LevelSpec {
    if (spec.mode === 'campaign' && spec.number) return campaignLevel(spec.number);
    if (spec.mode === 'story' && story) return storyLevel(story.ch, story.board);
    return { ...spec, assisted: false, ...(spec.mode === 'quick' ? quickLevel(spec.layout, spec.tier!, spec.biome, spec.seed) : {}) };
  }

  private async copyBalanceData() {
    const data = JSON.stringify({ game: 'jade-horizon', kind: 'balance-data', at: new Date().toISOString(), levelStats: this.profile.levelStats,
      stats: { gamesPlayed: this.profile.stats.gamesPlayed, boardsCleared: this.profile.stats.boardsCleared, playSeconds: this.profile.stats.playSeconds } });
    try { await navigator.clipboard.writeText(data); this.toast('Balance data copied — paste it to share', 'good'); }
    catch {
      const m = this.modal(`<h2>Balance data</h2><p class="muted small">Copy this text and share it.</p><textarea id="balanceData" class="data-box" readonly>${esc(data)}</textarea>
        <div class="modal-actions"><button class="btn primary" data-x>Done</button></div>`);
      const ta = m.querySelector<HTMLTextAreaElement>('#balanceData')!; ta.focus(); ta.select();
      this.on('[data-x]', () => this.closeModal(), m);
    }
  }

  private layoutSvg(pos: Pos[]): string {
    const maxX = Math.max(...pos.map(p => p.x)) + 2, maxY = Math.max(...pos.map(p => p.y)) + 2;
    const maxZ = Math.max(...pos.map(p => p.z));
    const W = maxX * 10, H = maxY * 13;
    const rects = [...pos].sort((a, b) => a.z - b.z).map(p =>
      `<rect x="${p.x * 10 + 1 - p.z * 1.5}" y="${p.y * 13 + 1 - p.z * 1.5}" width="18" height="24" rx="3" style="fill-opacity:${0.45 + (p.z / Math.max(1, maxZ)) * 0.55}"/>`).join('');
    return `<svg viewBox="-6 -6 ${W + 8} ${H + 8}" class="layout-svg">${rects}</svg>`;
  }

  // ======================= QUICK PLAY =======================
  quickPlay() {
    this.hideHud();
    this.stage.setCinematic(true);
    let tier: TierId = 'normal', layout = 'turtle', biome = this.stage.biome.id;
    const render = () => {
      this.setScreen('quick', `${this.header('Quick Play', 'Pick a difficulty, a board and a realm.')}
        <div class="quick">
          <h4>Difficulty</h4>
          <div class="tiers">${TIERS.map(t => `<button class="tier ${t.id === tier ? 'sel' : ''}" data-tier="${t.id}"><span class="tg">${t.glyph}</span><b>${t.name}</b><small>${t.desc}</small></button>`).join('')}</div>
          <h4>Board</h4>
          <div class="layouts">
            <button class="lay ${layout === 'random' ? 'sel' : ''}" data-lay="random"><div class="preview rnd">?</div><b>Random</b><small>Surprise me</small></button>
            ${LAYOUTS.map(l => {
              const best = this.profile.quick.best[`${l.id}-${tier}`];
              return `<button class="lay ${l.id === layout ? 'sel' : ''}" data-lay="${l.id}"><div class="preview">${this.layoutSvg(l.positions)}</div><b>${l.name}</b><small>${l.positions.length} tiles${best ? ` · best ${fmtTime(best.time)}` : ''}</small></button>`;
            }).join('')}
          </div>
          <h4>Realm</h4>
          <div class="realms">${BIOMES.map(b => `<button class="realm ${b.id === biome ? 'sel' : ''}" data-biome="${b.id}" style="--c:${b.accent};--c2:${b.skyHorizon}">${b.name}</button>`).join('')}</div>
        </div>
        <div class="sticky-cta"><button class="btn primary big" data-play>Play ${TIERS.find(t => t.id === tier)!.name}</button></div>`, 'quick');
      this.bindBack();
      this.on('[data-tier]', el => { tier = el.dataset.tier as TierId; keepScroll(render); });
      this.on('[data-lay]', el => { layout = el.dataset.lay!; keepScroll(render); });
      this.on('[data-biome]', el => { biome = Number(el.dataset.biome); this.goBiome(biome); keepScroll(render); });
      this.on('[data-play]', () => {
        const lay = layout === 'random' ? LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)].id : layout;
        this.play(quickLevel(lay, tier, biome, Math.floor(Math.random() * 1e9)));
      });
    };
    const keepScroll = (f: () => void) => {
      const sc = this.ui.querySelector('.screen')?.scrollTop ?? 0;
      f();
      const s = this.ui.querySelector('.screen'); if (s) s.scrollTop = sc;
    };
    render();
  }

  // ======================= STORY =======================
  storyMenu() {
    this.hideHud();
    this.stage.setCinematic(true);
    this.stage.saturation = 1;
    const st = this.profile.story;
    this.setScreen('story', `${this.header('The Lantern of Eight Winds', 'An original tale in eight chapters')}
      <div class="chapters">${CHAPTERS.map((c, i) => {
        const unlocked = i <= st.unlocked;
        const done = !!st.completed[i];
        const b = BIOMES[c.biome];
        return `<button class="chapter ${unlocked ? '' : 'locked'} ${done ? 'done' : ''}" data-ch="${i}" ${unlocked ? '' : 'disabled'} style="--c:${b.accent};--c2:${b.accent2}">
          <span class="ch-num">${c.subtitle}</span><b>${unlocked ? c.title : '???'}</b><small>${b.name}${done ? ' · ✓ Complete' : ''}</small></button>`;
      }).join('')}</div>
      <div class="center-row"><button class="btn" data-journal>Journal · ${st.fragments.length}/${CHAPTERS.length} fragments</button>
      ${st.ninthName ? `<span class="ninth">The Ninth Wind is called <b>${esc(st.ninthName)}</b></span>` : ''}</div>`, 'story');
    this.bindBack();
    this.on('[data-ch]', el => this.playChapter(Number(el.dataset.ch)));
    this.on('[data-journal]', () => this.journal());
  }

  journal() {
    const st = this.profile.story;
    this.setScreen('journal', `${this.header('Journal', 'Memory fragments of the Nine Winds')}
      <div class="journal">${CHAPTERS.map((c, i) => {
        const has = st.fragments.includes(i);
        return `<article class="frag ${has ? '' : 'locked'}"><h4>${has ? c.fragment.title : 'Unrecovered fragment'}</h4><p>${has ? esc(fillName(c.fragment.text, st.ninthName)) : 'Complete ' + c.subtitle + ' to recover this memory.'}</p></article>`;
      }).join('')}</div>`, 'journal');
    this.bindBack(() => this.storyMenu());
  }

  private async playChapter(ch: number, startBoard = 0, snapshot?: Snapshot) {
    const c = CHAPTERS[ch];
    await this.goBiome(c.biome);
    this.stage.saturation = 0.06;
    this.ui.classList.add('hidden');
    if (startBoard === 0 && !snapshot) await this.dialogue(c.intro, c.title, c.subtitle);
    const b = c.boards[startBoard];
    if (startBoard > 0 && b.between && !snapshot) await this.dialogue(b.between);
    await this.play(storyLevel(ch, startBoard), { story: { ch, board: startBoard }, snapshot });
  }

  private async storyBoardWon(ch: number, board: number) {
    const c = CHAPTERS[ch];
    if (board + 1 < c.boards.length) {
      this.quitGame(false);
      return this.playChapter(ch, board + 1);
    }
    this.quitGame(false);
    this.stage.saturation = 1;
    if (ch === CHAPTERS.length - 1) await this.nameNinth();
    await this.dialogue(c.outro.map(l => ({ ...l, text: fillName(l.text, this.profile.story.ninthName) })));
    const st = this.profile.story;
    st.completed[ch] = true;
    if (!st.fragments.includes(ch)) st.fragments.push(ch);
    st.unlocked = Math.max(st.unlocked, Math.min(CHAPTERS.length - 1, ch + 1));
    this.afterProgress();
    const m = this.modal(`<div class="frag-reveal"><div class="eyebrow">Memory fragment recovered</div><h2>${c.fragment.title}</h2>
      <p>${esc(fillName(c.fragment.text, st.ninthName))}</p>
      ${ch === CHAPTERS.length - 1 ? '<p class="fin">— The End —<br><small>Thank you for playing. The campaign and quick play await.</small></p>' : ''}</div>
      <div class="modal-actions"><button class="btn primary" data-ok>${ch + 1 < CHAPTERS.length ? `Continue to ${CHAPTERS[ch + 1].subtitle}` : 'Return'}</button></div>`, 'frag', false);
    this.on('[data-ok]', () => {
      this.closeModal();
      if (ch + 1 < CHAPTERS.length) this.playChapter(ch + 1); else this.storyMenu();
    }, m);
  }

  private nameNinth(): Promise<void> {
    return new Promise(res => {
      const ideas = ['Stillness', 'Hush', 'Lull', 'Ember', 'Quiet Harbor', 'Breath'];
      const m = this.modal(`<div class="name-ninth"><div class="tile145">${this.profile.story.ninthName ? esc(this.profile.story.ninthName.slice(0, 2)) : '?'}</div>
        <h2>The 145th Tile</h2><p>The blank tile waits for a name. What will you call the Ninth Wind?</p>
        <input id="ninth" maxlength="22" placeholder="Stillness" value="${esc(this.profile.story.ninthName)}" autocomplete="off">
        <div class="ideas">${ideas.map(i => `<button class="chip" data-idea="${i}">${i}</button>`).join('')}</div></div>
        <div class="modal-actions"><button class="btn primary" data-ok>Carve the name</button></div>`, 'name', false);
      const input = $<HTMLInputElement>('#ninth', m);
      setTimeout(() => input.focus(), 100);
      this.on('[data-idea]', el => { input.value = el.dataset.idea!; }, m);
      const done = () => {
        this.profile.story.ninthName = (input.value.trim() || 'Stillness').slice(0, 22);
        this.saveProfile();
        audio.play('achieve');
        this.closeModal(); res();
      };
      this.on('[data-ok]', done, m);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
    });
  }

  /** Visual-novel style dialogue with typewriter text. */
  private dialogue(lines: Line[], title?: string, subtitle?: string): Promise<void> {
    return new Promise(res => {
      this.dialogueActive = true;
      const box = document.createElement('div');
      box.className = 'dialogue';
      document.body.appendChild(box);
      let i = -1, typing = false, full = '', timer = 0;
      const finish = () => { clearInterval(timer); this.dialogueActive = false; box.classList.add('out'); setTimeout(() => box.remove(), 400); document.removeEventListener('keydown', key); res(); };
      const show = () => {
        i++;
        if (i >= lines.length) return finish();
        const l = lines[i];
        const ch = CAST[l.who];
        full = l.text;
        const narr = l.who === 'narrator';
        box.innerHTML = `${title && i === 0 ? `<div class="chapter-card"><small>${subtitle ?? ''}</small><h1>${title}</h1></div>` : ''}
          <div class="dlg ${narr ? 'narr' : ''}" style="--cc:${ch.color}">
            ${narr ? '' : `<div class="portrait">${this.medallion(ch.glyph, ch.color, false, 'lg')}</div>`}
            <div class="dlg-body">${narr ? '' : `<div class="who">${ch.name}<small>${ch.title}</small></div>`}<p class="txt"></p>
              <div class="dlg-foot"><span>${i + 1}/${lines.length}</span><button class="link" data-skip>Skip ▸▸</button><span class="tap">click / space ▸</span></div></div>
          </div>`;
        const p = box.querySelector('.txt') as HTMLElement;
        let k = 0; typing = true;
        clearInterval(timer);
        const speed = this.profile.settings.reducedMotion ? 1 : 18;
        timer = window.setInterval(() => {
          k += 2; p.textContent = full.slice(0, k);
          if (k % 6 === 0 && !narr) audio.play('tick');
          if (k >= full.length) { clearInterval(timer); typing = false; p.textContent = full; }
        }, speed);
        box.querySelector('[data-skip]')!.addEventListener('click', e => { e.stopPropagation(); finish(); });
      };
      const advance = () => {
        if (typing) { clearInterval(timer); typing = false; (box.querySelector('.txt') as HTMLElement).textContent = full; return; }
        audio.play('ui'); show();
      };
      const key = (e: KeyboardEvent) => { if ([' ', 'Enter', 'ArrowRight'].includes(e.key)) { e.preventDefault(); advance(); } if (e.key === 'Escape') finish(); };
      box.addEventListener('click', advance);
      document.addEventListener('keydown', key);
      show();
    });
  }

  // ======================= TUTORIAL =======================
  async startTutorial() {
    this.tutStep = 0;
    await this.play(tutorialLevel());
  }

  private renderCoach() {
    const g = this.game;
    let el = document.getElementById('coach');
    if (this.tutStep < 0 || !g) { el?.remove(); return; }
    const step = TUTORIAL_STEPS[this.tutStep];
    if (!el) { el = document.createElement('div'); el.id = 'coach'; document.body.appendChild(el); }
    const glossary = step.glossary ? `<div class="gloss">
      <div><span class="gi mist">?</span><b>Mist</b> hides the face of blocked tiles until they are free.</div>
      <div><span class="gi gold"></span><b>Gold pairs</b> score big — some levels ask you to collect them all.</div>
      <div><span class="gi lock">${ICON.lock}</span><b>Chains</b> show how many matches until a tile unlocks.</div>
      <div><span class="gi bomb">9</span><b>Bombs</b> tick down each match. Pair the two bombs with each other before zero!</div>
      <div><span class="gi clock">⧗</span><b>Sand clock</b> levels must be won before time runs out.</div></div>` : '';
    el.innerHTML = `<div class="coach-card">${this.medallion('文', '#c0392b', false, 'sm')}<div><div class="coach-step">Lesson ${this.tutStep + 1} / ${TUTORIAL_STEPS.length}</div><h4>${step.title}</h4><p>${step.text}</p>${glossary}
      <div class="coach-actions">${step.next ? `<button class="btn primary sm" data-next>${step.wait ? 'Skip step' : 'Next'}</button>` : ''}<button class="link" data-endtut>End tutorial</button></div></div></div>`;
    el.querySelector('[data-next]')?.addEventListener('click', () => { audio.play('ui'); this.advanceTutorial(); });
    el.querySelector('[data-endtut]')?.addEventListener('click', () => { this.tutStep = -1; this.renderCoach(); });
    step.onEnter?.(g);
  }

  private advanceTutorial() {
    if (this.tutStep < 0) return;
    this.tutStep++;
    if (this.tutStep >= TUTORIAL_STEPS.length) { this.tutStep = -1; }
    this.renderCoach();
  }

  private tutorialEvent(name: string) {
    if (this.tutStep < 0) return;
    const step = TUTORIAL_STEPS[this.tutStep];
    if (step.wait === name) setTimeout(() => this.advanceTutorial(), name === 'match' ? 500 : 250);
  }

  // ======================= PLAY =======================
  async play(spec: LevelSpec, opts: { snapshot?: Snapshot; story?: { ch: number; board: number } } = {}) {
    this.closeModal();
    if (this.game) this.quitGame(false);
    await this.goBiome(spec.biome);
    this.ui.classList.add('hidden');
    this.exportBtn.classList.add('hidden');
    if (!this.profile.stats.layoutsPlayed.includes(spec.layout)) this.profile.stats.layoutsPlayed.push(spec.layout);
    if (!opts.snapshot && spec.mode !== 'tutorial') {
      const st = this.levelStat(spec);
      st.attempts++; st.lastPlayed = Date.now();
      this.saveProfile();
      if (spec.assisted) this.toast(`<b>Lantern\u2019s Blessing:</b> ${BLESSING_TEXT}`, 'good', '燈');
    }
    this.lastCounters = { mistRevealed: 0, goldCollected: 0, bombsDefused: 0, locksBroken: 0, matches: 0 };
    const game = new Game(this.stage, this.view, spec, {
      hud: s => this.updateHud(s),
      end: e => this.onEnd(game, e),
      toast: (m, k) => this.toast(m, k),
      popup: (t, at, c) => this.popup(t, at, c),
      event: (name) => {
        if (name === 'match') this.syncLive(game);
        if (spec.mode === 'tutorial') this.tutorialEvent(name);
      },
    }, snap => saveSnapshot('auto', snap), opts.snapshot, opts.story ?? opts.snapshot?.story);
    this.game = game;
    if (spec.mode === 'story') this.stage.saturation = 0.06;
    this.showHud(spec);
    if (opts.snapshot) this.lastCounters = { ...game.counters };
    game.touchAssist = this.profile.settings.touchAssist;
    await game.start(!this.profile.settings.reducedMotion);
    this.portraitTip();
    if (window.matchMedia('(pointer: coarse)').matches && spec.mode !== 'tutorial') {
      this.tipOnce('zoom', 'Tip: <b>press and hold</b> the board to zoom in. Hold again or tap <b>View</b> to zoom out.', '看');
    }
    if (spec.mode === 'tutorial') this.renderCoach();
    else if (!opts.snapshot && spec.mode === 'campaign' && spec.number && [11, 21, 31, 41, 51].includes(spec.number)) {
      const intro = ['', 'Mist veils the faces of blocked tiles in this realm.', 'Golden pairs appear — some levels are won by collecting them all.',
        'The sand clock appears: beat the timer!', 'Chains lock tiles until you have made enough matches.', 'Bombs! Pair them before their fuse reaches zero.'][Math.floor((spec.number - 1) / 10)];
      this.toast(`<b>New mechanic:</b> ${intro}`, 'info', '新');
    }
  }

  private resume(snap: Snapshot, slot: Slot) {
    this.profile.stats.resumed++;
    this.afterProgress();
    if (snap.spec.mode === 'story' && snap.story) {
      this.playChapter(snap.story.ch, snap.story.board, snap);
    } else this.play(snap.spec, { snapshot: snap });
    if (slot !== 'auto') saveSnapshot('auto', snap);
  }

  private recenter() {
    this.game?.resetZoom();
  }

  /** Space the HUD occupies, so the camera keeps the board clear of it. */
  private hudInsets() {
    const H = window.innerHeight;
    let top = 12, bottom = 12;
    this.hud.querySelectorAll('.hud-l, .hud-c, .hud-r').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.height) top = Math.max(top, r.bottom + 8);
    });
    for (const el of [this.hud.querySelector('.toolbar'), document.getElementById('coach')]) {
      const r = el?.getBoundingClientRect();
      if (r && r.height) bottom = Math.max(bottom, H - r.top + 8);
    }
    return { top, bottom, left: 10, right: 10 };
  }

  /** Rotating a phone re-lays wide boards and reframes; small height changes (browser bars) are ignored. */
  private watchScreenShape() {
    let lastAspect = window.innerWidth / window.innerHeight;
    let timer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const g = this.game;
        const aspect = window.innerWidth / window.innerHeight;
        if (!g || !g.running) { lastAspect = aspect; return; }
        const turn = this.view.wantTransposed(g.board.tiles);
        const shapeChanged = Math.abs(aspect - lastAspect) / lastAspect > 0.15;
        lastAspect = aspect;
        if (turn !== this.view.transposed) {
          this.view.transposed = turn;
          this.view.relayout(g.board.tiles).then(() => g.resetZoom());
          this.portraitTip();
        } else if (shapeChanged) g.resetZoom();
      }, 300);
    });
  }

  private tipOnce(id: string, html: string, glyph: string) {
    if (this.profile.seenTips.includes(id)) return;
    this.profile.seenTips.push(id);
    this.saveProfile();
    setTimeout(() => this.toast(html, 'info', glyph), 900);
  }

  private portraitTip() {
    if (this.view.transposed) this.tipOnce('portrait', '<b>Board turned to fit your screen.</b> A tile is free when its <b>top or bottom</b> side is open (dimmed tiles are blocked).', '轉');
  }

  quitGame(toMenu = true) {
    const g = this.game;
    if (g) {
      if (!g.ended) { g.saveNow(); this.profile.stats.playSeconds += Math.round(g.elapsed); this.saveProfile(); }
      g.dispose();
      this.game = null;
    }
    this.tutStep = -1; this.renderCoach();
    this.closeModal();
    this.hideHud();
    this.stage.setCinematic(true);
    if (toMenu) this.title();
  }

  private syncLive(g: Game) {
    const s = this.profile.stats;
    const c = g.counters, l = this.lastCounters;
    s.matches += c.matches - l.matches;
    s.mistRevealed += c.mistRevealed - l.mistRevealed;
    s.goldCollected += c.goldCollected - l.goldCollected;
    s.bombsDefused += c.bombsDefused - l.bombsDefused;
    s.locksBroken += c.locksBroken - l.locksBroken;
    s.maxCombo = Math.max(s.maxCombo, g.maxCombo);
    this.lastCounters = { ...c };
    const { achievements, badges } = evaluate(this.profile);
    this.announce(achievements, badges);
    this.saveProfile();
  }

  private announce(a: Achievement[], b: Badge[]) {
    a.forEach((x, i) => setTimeout(() => { audio.play('achieve'); this.toast(`<small>Achievement unlocked</small><b>${x.name}</b>`, 'ach', x.glyph); }, i * 700));
    b.forEach((x, i) => setTimeout(() => { audio.play('achieve'); this.toast(`<small>Badge earned</small><b>${x.name}</b>`, 'ach', x.glyph); }, (a.length + i) * 700));
  }

  private afterProgress(result?: Parameters<typeof evaluate>[1]) {
    const { achievements, badges } = evaluate(this.profile, result);
    this.announce(achievements, badges);
    this.saveProfile();
    return { achievements, badges };
  }

  private onEnd(g: Game, e: EndInfo) {
    this.syncLive(g);
    const s = this.profile.stats;
    const spec = g.spec;
    s.gamesPlayed++;
    s.hintsUsed += g.hintsUsed; s.shufflesUsed += g.shufflesUsed; s.undos += g.undosUsed;
    s.playSeconds += Math.round(e.time);
    if (spec.mode === 'quick') s.quickGames++;
    if (e.won) {
      s.boardsCleared++;
      if (spec.tier === 'zen') s.zenClears++;
      if (spec.tier === 'master') s.masterClears++;
    } else s.failures++;
    let newBest = false;
    if (spec.mode === 'campaign' && e.won) {
      const prev = this.profile.campaign.stars[spec.key] ?? 0;
      this.profile.campaign.stars[spec.key] = Math.max(prev, e.stars);
      const b = this.profile.campaign.best[spec.key];
      if (!b || e.score > b.score) { this.profile.campaign.best[spec.key] = { score: e.score, time: Math.round(e.time) }; newBest = !!b; }
    }
    if (spec.mode === 'quick' && e.won) {
      const k = `${spec.layout}-${spec.tier}`;
      const b = this.profile.quick.best[k];
      if (!b || e.time < b.time) { this.profile.quick.best[k] = { score: e.score, time: Math.round(e.time) }; newBest = !!b; }
    }
    if (spec.mode === 'tutorial' && e.won) { this.profile.tutorialDone = true; this.tutStep = -1; this.renderCoach(); }
    if (spec.mode !== 'tutorial') {
      const st = this.levelStat(spec);
      st.totalTime += Math.round(e.time);
      if (e.won) {
        st.wins++; st.failStreak = 0;
        if (spec.assisted) st.assistedWins++;
        if (!st.bestTime || e.time < st.bestTime) st.bestTime = Math.round(e.time);
      } else { st.failStreak++; st.losses[e.cause] = (st.losses[e.cause] ?? 0) + 1; }
    }
    clearSnapshot('auto');
    const unlocked = this.afterProgress(e.result);
    this.results(g, e, newBest, unlocked.achievements.length + unlocked.badges.length);
  }

  // ======================= RESULTS =======================
  private results(g: Game, e: EndInfo, newBest: boolean, unlockedCount: number) {
    const spec = g.spec;
    const isCampaign = spec.mode === 'campaign';
    const isStory = spec.mode === 'story';
    const next = isCampaign && e.won && spec.number! < CAMPAIGN_COUNT ? spec.number! + 1 : 0;
    const showStars = spec.mode !== 'tutorial';
    const labels = ['Victory', `Under ${fmtTime(spec.parTime)}`, 'No hints · undos · shuffles'];
    const m = this.modal(`
      <div class="res ${e.won ? 'win' : 'lose'}">
        <div class="eyebrow">${esc(spec.name)}</div>
        <h1>${e.won ? (spec.mode === 'tutorial' ? 'Lesson Complete' : 'Victory') : 'Defeat'}</h1>
        <p class="reason">${e.reason}</p>
        ${showStars ? `<div class="big-stars">${[0, 1, 2].map(k => `<div class="bs ${e.starReasons[k] ? 'on' : ''}" style="--d:${0.3 + k * 0.45}s"><i>${ICON.star}</i><small>${labels[k]}</small></div>`).join('')}</div>` : ''}
        <div class="res-stats">
          <div><small>Score</small><b>${e.score.toLocaleString()}</b>${newBest ? '<em>New best!</em>' : ''}</div>
          <div><small>Time</small><b>${fmtTime(e.time)}</b></div>
          <div><small>Best combo</small><b>×${g.maxCombo}</b></div>
          <div><small>Tiles</small><b>${g.board.tiles.length - g.board.remaining()}/${g.board.tiles.length}</b></div>
        </div>
        ${unlockedCount ? `<p class="unl">${unlockedCount} new unlock${unlockedCount > 1 ? 's' : ''} — see Achievements</p>` : ''}
        ${spec.assisted ? '<p class="muted small">Played with the Lantern\u2019s Blessing.</p>' : ''}
        ${!e.won ? this.blessingBox(spec) : ''}
      </div>
      <div class="modal-actions">
        ${isStory && e.won ? '<button class="btn primary" data-a="story-next">Continue the story</button>' : ''}
        ${next ? '<button class="btn primary" data-a="next">Next level</button>' : ''}
        ${!e.won || !isStory ? '<button class="btn" data-a="retry">Retry</button>' : ''}
        ${spec.mode === 'quick' ? '<button class="btn" data-a="again">New board</button>' : ''}
        <button class="btn ghost" data-a="menu">${isCampaign ? 'Map' : isStory ? 'Chapters' : 'Menu'}</button>
      </div>`, 'results', false);
    if (showStars && e.won) e.starReasons.forEach((on, k) => on && setTimeout(() => audio.play('star', k * 2), 300 + k * 450));
    this.on('[data-a]', el => {
      const a = el.dataset.a!;
      const bless = this.blessed(m);
      this.closeModal();
      if (a === 'next') { this.quitGame(false); this.levelIntroAfterMap(next); }
      if (a === 'retry') {
        this.profile.stats.retries[spec.key] = (this.profile.stats.retries[spec.key] ?? 0) + 1;
        this.afterProgress();
        if (spec.mode === 'tutorial') this.tutStep = 0;
        const base = this.baseSpec(spec, g.story);
        this.play(bless ? withBlessing(base) : base, { story: g.story });
      }
      if (a === 'again') this.play(quickLevel(spec.layout, spec.tier!, spec.biome, Math.floor(Math.random() * 1e9)));
      if (a === 'story-next' && g.story) this.storyBoardWon(g.story.ch, g.story.board);
      if (a === 'menu') {
        this.quitGame(false);
        if (isCampaign) this.campaignMap(spec.number); else if (isStory) this.storyMenu(); else if (spec.mode === 'quick') this.quickPlay(); else this.title();
      }
    }, m);
  }

  private levelIntroAfterMap(n: number) {
    this.campaignMap(n);
    setTimeout(() => this.levelIntro(n), 350);
  }

  // ======================= PAUSE / LOAD =======================
  pauseMenu() {
    const g = this.game;
    if (!g || g.ended) return;
    g.setPaused(true);
    const m = this.modal(`<h2>Paused</h2><p class="muted">${esc(g.spec.name)} · ${fmtTime(g.elapsed)}</p>
      <div class="pause-grid">
        <button class="btn primary" data-a="resume">Resume</button>
        ${g.spec.mode !== 'tutorial' ? SLOTS.filter(s => s !== 'auto').map((s, i) => `<button class="btn" data-slot="${s}">Save to slot ${i + 1}</button>`).join('') : ''}
        <button class="btn" data-a="restart">Restart</button>
        <button class="btn" data-a="settings">Settings</button>
        <button class="btn ghost" data-a="quit">${g.spec.mode === 'tutorial' ? 'Leave lesson' : 'Save &amp; quit'}</button>
      </div>
      <p class="muted small">Your game is autosaved after every move. Continue it any time from the main menu.</p>`, 'pause');
    this.on('[data-slot]', el => {
      const slot = el.dataset.slot as Slot;
      const ok = saveSnapshot(slot, g.snapshot(`${g.spec.name}`));
      this.toast(ok ? `Saved to ${slot.replace('slot', 'slot ')}` : 'Saved for this session only (storage unavailable)', ok ? 'good' : 'warn');
    }, m);
    this.on('[data-a]', el => {
      const a = el.dataset.a!;
      if (a === 'resume') this.closeModal();
      if (a === 'restart') { this.closeModal(); clearSnapshot('auto'); const spec = g.spec; const story = g.story; this.quitGame(false); clearSnapshot('auto'); this.play(spec, { story }); }
      if (a === 'settings') this.settings(true);
      if (a === 'quit') {
        this.closeModal();
        const mode = g.spec.mode;
        this.quitGame(false);
        if (mode === 'campaign') this.campaignMap(g.spec.number); else if (mode === 'story') this.storyMenu(); else this.title();
      }
    }, m);
  }

  loadScreen() {
    const rows = SLOTS.map(s => ({ s, snap: loadSnapshot(s) }));
    this.setScreen('load', `${this.header('Load Game', 'Autosave plus three manual slots')}
      <div class="slots">${rows.map(({ s, snap }) => snap ? `
        <div class="slot"><div class="slot-meta"><b>${s === 'auto' ? 'Autosave' : 'Slot ' + s.slice(-1)}</b>
          <span>${esc(snap.label)}</span><small>${snap.spec.mode} · ${BIOMES[snap.spec.biome].name} · ${Math.round(100 - snap.tiles.filter(t => !t.removed).length / snap.tiles.length * 100)}% cleared · ${fmtTime(snap.elapsed)} · ${new Date(snap.savedAt).toLocaleString()}</small></div>
          <div class="slot-btns"><button class="btn primary sm" data-load="${s}">Load</button><button class="btn ghost sm" data-del="${s}">Delete</button></div></div>` :
        `<div class="slot empty"><b>${s === 'auto' ? 'Autosave' : 'Slot ' + s.slice(-1)}</b><span>Empty</span></div>`).join('')}</div>`, 'load');
    this.bindBack();
    this.on('[data-load]', el => { const s = el.dataset.load as Slot; const snap = loadSnapshot(s); if (snap) this.resume(snap, s); });
    this.on('[data-del]', el => { clearSnapshot(el.dataset.del as Slot); this.loadScreen(); });
  }

  // ======================= ACHIEVEMENTS / PROFILE =======================
  achievementsScreen() {
    const p = this.profile;
    const got = Object.keys(p.achievements).length;
    this.setScreen('ach', `${this.header('Achievements', `${got} / ${ACHIEVEMENTS.length} unlocked`)}
      <div class="ach-grid">${ACHIEVEMENTS.map(a => {
        const on = !!p.achievements[a.id];
        const pr = a.progress?.(p);
        return `<div class="ach ${on ? 'on' : ''}">${this.medallion(a.glyph, on ? 'var(--accent)' : '#555', !on, 'sm')}
          <div><b>${a.name}</b><small>${a.desc}</small>
          ${pr && !on ? `<div class="prog"><i style="width:${Math.min(100, pr[0] / pr[1] * 100)}%"></i></div><small class="pn">${Math.min(pr[0], pr[1])}/${pr[1]}</small>` : ''}
          ${on ? `<small class="date">${new Date(p.achievements[a.id]).toLocaleDateString()}</small>` : ''}</div></div>`;
      }).join('')}</div>`, 'ach');
    this.bindBack();
  }

  profileScreen() {
    const p = this.profile, s = p.stats;
    const rows: [string, string][] = [
      ['Boards won', `${s.boardsCleared}`], ['Games played', `${s.gamesPlayed}`], ['Pairs matched', s.matches.toLocaleString()],
      ['Best combo', `×${s.maxCombo}`], ['Campaign stars', `${this.totalStars()} / ${CAMPAIGN_COUNT * 3}`],
      ['Levels unlocked', `${this.highestUnlocked()} / ${CAMPAIGN_COUNT}`], ['Story', `${p.story.completed.filter(Boolean).length} / ${CHAPTERS.length} chapters`],
      ['Time played', `${Math.floor(s.playSeconds / 3600)}h ${Math.floor(s.playSeconds / 60) % 60}m`], ['Gold pairs', `${s.goldCollected}`],
      ['Bombs defused', `${s.bombsDefused}`], ['Chains broken', `${s.locksBroken}`], ['Mist lifted', `${s.mistRevealed}`],
      ['Hints used', `${s.hintsUsed}`], ['Layouts explored', `${s.layoutsPlayed.length} / ${LAYOUTS.length}`],
    ];
    this.setScreen('profile', `${this.header('Badges & Stats', 'Your journey so far')}
      <h4 class="sec">Badges</h4>
      <div class="badges">${BADGES.map(b => {
        const on = !!p.badges[b.id];
        return `<div class="badge ${on ? 'on' : ''}" title="${esc(b.desc)}">${this.medallion(b.glyph, on ? b.color : '#555', !on)}<b>${b.name}</b><small>${b.desc}</small></div>`;
      }).join('')}</div>
      <h4 class="sec">Statistics</h4>
      <div class="stats">${rows.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('')}</div>
      <h4 class="sec">Toughest levels</h4>
      ${this.toughestTable()}
      <div class="center-row"><button class="btn" data-copy-balance>Copy balance data</button>
        <span class="muted small">Your per-level wins, losses and times, as text you can share to help tune difficulty. Nothing leaves your device unless you paste it somewhere.</span></div>`, 'profile');
    this.bindBack();
    this.on('[data-copy-balance]', () => this.copyBalanceData());
  }

  private toughestTable(): string {
    const rows = Object.entries(this.profile.levelStats)
      .map(([k, st]) => ({ k, st, lost: Object.values(st.losses).reduce((a, b) => a + b, 0) }))
      .filter(r => r.lost > 0).sort((a, b) => b.lost - a.lost || a.st.wins - b.st.wins).slice(0, 6);
    if (!rows.length) return '<p class="muted tough-empty">No losses yet. Levels that beat you will show up here.</p>';
    const label = (k: string) => k.startsWith('c') ? `Level ${k.slice(1)} · ${campaignLevel(Number(k.slice(1))).name}` : k.startsWith('s') ? `Story ${k.slice(1)}` : k.startsWith('q-') ? `Quick · ${k.slice(2).replace('-', ' · ')}` : k;
    const causes: Record<string, string> = { bomb: 'bombs', clock: 'the clock', stuck: 'no moves' };
    return `<div class="tough">${rows.map(r => {
      const worst = Object.entries(r.st.losses).sort((a, b) => b[1] - a[1])[0];
      return `<div><b>${esc(label(r.k))}</b><span>${r.st.wins}/${r.st.attempts} won · mostly lost to ${causes[worst[0]] ?? worst[0]}</span></div>`;
    }).join('')}</div>`;
  }

  // ======================= SETTINGS =======================
  settings(fromPause = false) {
    const s = this.profile.settings;
    const m = this.modal(`<h2>Settings</h2>
      <div class="settings">
        <label>Master volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-k="volume"></label>
        <label class="tog"><input type="checkbox" ${s.music ? 'checked' : ''} data-k="music"> Ambient music</label>
        <label class="tog"><input type="checkbox" ${s.sfx ? 'checked' : ''} data-k="sfx"> Sound effects</label>
        <label class="tog"><input type="checkbox" ${s.labels ? 'checked' : ''} data-k="labels"> Corner labels on tiles (easier to read)</label>
        <label class="tog"><input type="checkbox" ${s.dimBlocked ? 'checked' : ''} data-k="dimBlocked"> Dim blocked tiles</label>
        <label class="tog"><input type="checkbox" ${s.showMoves ? 'checked' : ''} data-k="showMoves"> Show available moves count</label>
        <label class="tog"><input type="checkbox" ${s.reducedMotion ? 'checked' : ''} data-k="reducedMotion"> Reduced motion</label>
        <label class="tog"><input type="checkbox" ${s.touchAssist ? 'checked' : ''} data-k="touchAssist"> Touch assist: snap taps to the nearest free tile</label>
        <label class="tog"><input type="checkbox" ${s.portraitTurn ? 'checked' : ''} data-k="portraitTurn"> Turn wide boards to fit a portrait screen</label>
        <label>Graphics <select data-k="quality"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High (shadows, bloom, color grading)</option><option value="low" ${s.quality === 'low' ? 'selected' : ''}>Performance</option></select></label>
      </div>
      ${fromPause ? '' : `<h4 class="sec">Save data</h4><div class="row-btns">
        <button class="btn sm" data-a="export">Export save file</button>
        <label class="btn sm file">Import save file<input type="file" accept=".json,application/json" hidden data-import></label>
        <button class="btn sm danger" data-a="reset">Reset all progress</button></div>`}
      <div class="modal-actions"><button class="btn primary" data-a="close">Done</button></div>`, 'settings');
    m.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach(inp => inp.addEventListener('change', () => this.applySetting(inp)));
    m.querySelector<HTMLInputElement>('[data-k="volume"]')!.addEventListener('input', e => audio.setVolume(Number((e.target as HTMLInputElement).value)));
    this.on('[data-a]', el => {
      const a = el.dataset.a!;
      if (a === 'close') { this.closeModal(); if (fromPause) this.pauseMenu(); }
      if (a === 'export') this.download(`jade-horizon-save-${new Date().toISOString().slice(0, 10)}.json`, exportAll(), 'application/json');
      if (a === 'reset') {
        if (confirm('Erase all progress, achievements, badges and saved games? This cannot be undone.')) {
          resetAll(); this.profile = loadProfile(); this.closeModal(); this.toast('Progress reset', 'warn'); this.title();
        }
      }
    }, m);
    m.querySelector<HTMLInputElement>('[data-import]')?.addEventListener('change', async e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const ok = importAll(await f.text());
      if (ok) { this.profile = loadProfile(); this.toast('Save imported', 'good'); this.closeModal(); this.title(); }
      else this.toast('That file is not a Jade Horizon save', 'warn');
    });
  }

  private applySetting(inp: HTMLInputElement | HTMLSelectElement) {
    const s = this.profile.settings as unknown as Record<string, unknown>;
    const k = inp.dataset.k!;
    const v = inp.type === 'checkbox' ? (inp as HTMLInputElement).checked : inp.type === 'range' ? Number(inp.value) : inp.value;
    s[k] = v;
    this.saveProfile();
    const st = this.profile.settings;
    if (k === 'volume') audio.setVolume(st.volume);
    if (k === 'music') audio.setMusic(st.music);
    if (k === 'sfx') audio.sfxOn = st.sfx;
    if (k === 'quality') { this.stage.setQuality(st.quality); this.stage.setBiome(this.stage.biome.id, true); }
    if (k === 'dimBlocked') { this.view.dimBlocked = st.dimBlocked; this.refreshBoard(); }
    if (k === 'labels') {
      this.atlas.showLabels = st.labels; this.atlas.build();
      if (this.game) { const g = this.game; this.view.build(g.board.tiles, false); this.refreshBoard(); }
    }
    if (k === 'showMoves') this.hud.classList.toggle('no-moves', !st.showMoves);
    if (k === 'touchAssist' && this.game) this.game.touchAssist = st.touchAssist;
    if (k === 'portraitTurn') {
      this.view.portraitTurn = st.portraitTurn;
      const g = this.game;
      if (g) {
        const turn = this.view.wantTransposed(g.board.tiles);
        if (turn !== this.view.transposed) { this.view.transposed = turn; this.view.relayout(g.board.tiles).then(() => g.resetZoom()); }
      }
    }
  }

  private refreshBoard() {
    const g = this.game; if (!g) return;
    this.view.refreshAll(g.board.tiles, g.board.freeMap(), g.board.matches);
  }

  // ======================= HUD =======================
  private showHud(spec: LevelSpec) {
    this.hud.classList.remove('hidden');
    this.hud.classList.toggle('no-moves', !this.profile.settings.showMoves);
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-l"><div class="lvl-name">${spec.mode === 'campaign' ? `<span>Lv ${spec.number}</span>` : ''}${esc(spec.name)}</div>
          <div class="chips"><span class="chip gold-chip" data-r="gold"></span><span class="chip bomb-chip" data-r="bomb"></span></div></div>
        <div class="hud-c"><div class="score" data-r="score">0</div><div class="combo"><i data-r="comboBar"></i><span data-r="combo"></span></div></div>
        <div class="hud-r"><div class="time" data-r="time">0:00</div><div class="sub"><span data-r="tiles"></span><span class="moves" data-r="moves"></span></div></div>
      </div>
      <div class="toolbar">
        <button class="tb" data-t="hint" title="Hint (H)">${ICON.hint}<span>Hint</span><em data-r="hints"></em></button>
        <button class="tb" data-t="shuffle" title="Shuffle (S)">${ICON.shuffle}<span>Shuffle</span><em data-r="shuffles"></em></button>
        <button class="tb" data-t="undo" title="Undo (Z)">${ICON.undo}<span>Undo</span><em data-r="undos"></em></button>
        <button class="tb" data-t="center" title="Recenter camera (R)">${ICON.center}<span>View</span></button>
        <button class="tb" data-t="pause" title="Pause (Esc)">${ICON.pause}<span>Menu</span></button>
      </div>`;
    this.hudRefs = {};
    this.hud.querySelectorAll<HTMLElement>('[data-r]').forEach(el => { this.hudRefs[el.dataset.r!] = el; });
    this.hud.querySelectorAll<HTMLElement>('[data-t]').forEach(b => b.addEventListener('click', () => {
      audio.unlock();
      const g = this.game; if (!g) return;
      const t = b.dataset.t;
      if (t === 'hint') g.hint();
      if (t === 'shuffle') g.shuffle();
      if (t === 'undo') g.undo();
      if (t === 'center') { this.recenter(); audio.play('ui'); }
      if (t === 'pause') { audio.play('ui'); this.pauseMenu(); }
    }));
  }

  private hideHud() { this.hud.classList.add('hidden'); this.hud.innerHTML = ''; }

  private updateHud(s: HudState) {
    const r = this.hudRefs;
    if (!r.score) return;
    r.score.textContent = s.score.toLocaleString();
    r.combo.textContent = s.combo > 1 ? `Combo ×${s.combo}` : '';
    r.comboBar.style.width = `${s.combo > 0 ? s.comboWindow * 100 : 0}%`;
    if (s.timeLeft !== null) {
      r.time.textContent = `⧗ ${fmtTime(s.timeLeft)}`;
      r.time.classList.toggle('danger', s.timeLeft < 30);
    } else r.time.textContent = fmtTime(s.elapsed);
    r.tiles.textContent = `${s.tilesLeft} tiles`;
    r.moves.textContent = `${s.moves} move${s.moves === 1 ? '' : 's'}`;
    const lim = (n: number) => (n < 0 ? '∞' : String(n));
    r.hints.textContent = lim(s.hints); r.shuffles.textContent = lim(s.shuffles); r.undos.textContent = lim(s.undos);
    r.gold.style.display = s.goldTotal ? '' : 'none';
    r.gold.textContent = s.objective === 'gold' ? `Gold ${s.goldTotal - s.goldLeft}/${s.goldTotal}` : `Gold ${s.goldTotal - s.goldLeft}/${s.goldTotal} bonus`;
    r.bomb.style.display = s.nextBomb !== null ? '' : 'none';
    if (s.nextBomb !== null) { r.bomb.textContent = `Fuse ${s.nextBomb}`; r.bomb.classList.toggle('danger', s.nextBomb <= 3); }
  }

  // ======================= export =======================
  private download(name: string, text: string, type = 'text/plain') {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private async exportCode() {
    let code = this.source;
    try {
      const r = await fetch(location.href, { cache: 'no-store' });
      if (r.ok) { const t = await r.text(); if (t.includes('Jade Horizon')) code = t; }
    } catch { /* fall back to the boot-time copy */ }
    this.download('jade-horizon-source.txt', code);
    this.toast('Source exported', 'good');
  }

  /** Small helper used by the tutorial glossary & debugging. */
  describeFace(face: number) { return faceName(face); }
}
