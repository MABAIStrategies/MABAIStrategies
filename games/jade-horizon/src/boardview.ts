// 3D tile meshes and their animations.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { TileData, Pos } from './engine';
import type { FaceAtlas } from './faces';
import { Stage, ease } from './stage';
import { DAIS_TOP } from './world';

export const TW = 1.0, TD = 1.32, TH = 0.62;

interface TileMesh {
  id: number;
  root: THREE.Group;
  body: THREE.Mesh;
  face: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  faceMat: THREE.MeshStandardMaterial;
  base: THREE.Vector3;
  badge?: THREE.Sprite;
  badgeKey?: string;
  lift: number;
  liftTarget: number;
  shownFace: number; // -1 = back
  hidden: boolean;
  busy: boolean; // a tween owns the transform
  gold: boolean;
}

function bodyGeometry(): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(TW * 0.95, TH, TD * 0.95, 3, 0.09);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const cols = new Float32Array(pos.count * 3);
  const ivory = new THREE.Color('#f7efdc'), jade = new THREE.Color('#1f7a58'), edge = new THREE.Color('#d9cdb3');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / TH; // -0.5..0.5
    if (y < -0.12) c.copy(jade);
    else if (y < -0.06) c.copy(jade).lerp(edge, (y + 0.12) / 0.06);
    else c.copy(edge).lerp(ivory, Math.min(1, (y + 0.06) / 0.25));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function badgeTexture(kind: 'lock' | 'bomb', n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2);
  g.fillStyle = kind === 'bomb' ? '#1c1c1c' : '#3a3f4a'; g.fill();
  g.lineWidth = 8; g.strokeStyle = kind === 'bomb' ? '#ff5a2a' : '#c8d0dc'; g.stroke();
  if (kind === 'lock') {
    g.strokeStyle = '#e8edf4'; g.lineWidth = 9;
    g.beginPath(); g.arc(64, 50, 17, Math.PI, 0); g.stroke();
    g.fillStyle = '#e8edf4'; g.fillRect(40, 50, 48, 34);
    g.fillStyle = '#3a3f4a'; g.font = '900 30px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 64, 69);
  } else {
    g.fillStyle = n <= 3 ? '#ff4a2a' : '#ffd0a0'; g.font = '900 64px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(n), 64, 70);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sparkTex: THREE.Texture | null = null;
function sparkTexture(): THREE.Texture {
  if (sparkTex) return sparkTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.85)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  sparkTex = new THREE.CanvasTexture(c);
  return sparkTex;
}

export class BoardView {
  group = new THREE.Group();
  private meshes = new Map<number, TileMesh>();
  private bodyGeo = bodyGeometry();
  private faceGeo = new THREE.PlaneGeometry(TW * 0.82, TD * 0.84).rotateX(-Math.PI / 2);
  private hintIds: number[] = [];
  private selected = -1;
  private hover = -1;
  private t = 0;
  private sparks: { pts: THREE.Points; vel: Float32Array; life: number }[] = [];
  private raycaster = new THREE.Raycaster();
  center = new THREE.Vector3();
  extent = { w: 10, d: 8, h: 1 };
  dimBlocked = true;

  constructor(private stage: Stage, private atlas: FaceAtlas) {
    stage.boardRoot.add(this.group);
    stage.onFrame.push(dt => this.update(dt));
  }

  /** Portrait phones: wide boards are laid out turned 90°, tiles kept upright. */
  transposed = false;
  portraitTurn = true;
  /** Screen-space margins the board must stay clear of (HUD bars), in CSS px. */
  safeInsets: () => { top: number; bottom: number; left: number; right: number } = () => ({ top: 90, bottom: 100, left: 12, right: 12 });

  /** Board-plane position before centering. Logical rows/columns swap when transposed. */
  private rawXZ(p: Pos, transposed = this.transposed): [number, number] {
    return transposed ? [-p.y * TW / 2, p.x * TD / 2] : [p.x * TW / 2, p.y * TD / 2];
  }

  worldPos(p: Pos): THREE.Vector3 {
    const [x, z] = this.rawXZ(p);
    return new THREE.Vector3(x, DAIS_TOP + TH / 2 + p.z * TH, z).sub(this.center);
  }

  private bounds(tiles: TileData[], transposed: boolean) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const t of tiles) {
      const [x, z] = this.rawXZ(t.pos, transposed);
      minX = Math.min(minX, x - TW / 2); maxX = Math.max(maxX, x + TW / 2);
      minZ = Math.min(minZ, z - TD / 2); maxZ = Math.max(maxZ, z + TD / 2);
    }
    return { minX, maxX, minZ, maxZ }; // outer edges of the tile meshes
  }

  /** Whether this board should be turned for the current screen shape. */
  wantTransposed(tiles: TileData[]): boolean {
    if (!this.portraitTurn || this.stage.camera.aspect >= 0.8) return false;
    const b = this.bounds(tiles, false);
    return (b.maxX - b.minX) > (b.maxZ - b.minZ) * 1.15;
  }

  private measure(tiles: TileData[]) {
    const b = this.bounds(tiles, this.transposed);
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    this.extent = { w: b.maxX - b.minX, d: b.maxZ - b.minZ, h: Math.max(...tiles.map(t => t.pos.z)) + 1 };
  }

  /** Re-lay the existing board (e.g. after the phone is rotated). */
  relayout(tiles: TileData[]): Promise<void> {
    this.measure(tiles);
    const ps: Promise<void>[] = [];
    for (const t of tiles) {
      const m = this.meshes.get(t.id); if (!m) continue;
      const from = m.root.position.clone();
      m.base = this.worldPos(t.pos);
      if (m.hidden) { m.root.position.copy(m.base); continue; }
      m.busy = true;
      const to = m.base.clone();
      ps.push(this.stage.tweens.add(0.6, k => { m.root.position.lerpVectors(from, to, k); m.root.position.y += Math.sin(k * Math.PI) * 1.2; },
        { ease: ease.inOutCubic, delay: Math.random() * 0.15, tag: 'tile' + t.id }).then(() => { m.busy = false; m.root.position.copy(m.base); }));
    }
    return Promise.all(ps).then(() => undefined);
  }

  clear() {
    for (const m of this.meshes.values()) {
      this.group.remove(m.root);
      m.bodyMat.dispose(); m.faceMat.dispose();
      if (m.badge) { (m.badge.material as THREE.SpriteMaterial).map?.dispose(); m.badge.material.dispose(); }
      this.stage.tweens.cancel('tile' + m.id);
    }
    this.meshes.clear();
    this.hintIds = []; this.selected = -1; this.hover = -1;
  }

  build(tiles: TileData[], animate = true): Promise<void> {
    this.clear();
    this.transposed = this.wantTransposed(tiles);
    this.measure(tiles);
    const order = [...tiles].sort((a, b) => a.pos.z - b.pos.z || a.pos.y - b.pos.y || a.pos.x - b.pos.x);
    const promises: Promise<void>[] = [];
    order.forEach((t, i) => {
      const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.02, emissive: new THREE.Color('#000000') });
      const faceMat = new THREE.MeshStandardMaterial({ map: this.atlas.textures[t.face], roughness: 0.45, transparent: false });
      const body = new THREE.Mesh(this.bodyGeo, bodyMat);
      const face = new THREE.Mesh(this.faceGeo, faceMat);
      face.position.y = TH / 2 + 0.004;
      body.castShadow = true; body.receiveShadow = true;
      body.userData.tileId = t.id; face.userData.tileId = t.id;
      const root = new THREE.Group();
      root.add(body, face);
      const base = this.worldPos(t.pos);
      root.position.copy(base);
      const tm: TileMesh = { id: t.id, root, body, face, bodyMat, faceMat, base, lift: 0, liftTarget: 0, shownFace: t.face, hidden: t.removed, busy: false, gold: t.gold };
      this.meshes.set(t.id, tm);
      root.visible = !t.removed;
      this.group.add(root);
      this.applyAttributes(t);
      if (animate && !t.removed) {
        const delay = 0.15 + i * (1.1 / tiles.length) + Math.random() * 0.12;
        const h = 9 + Math.random() * 6, spin = (Math.random() - 0.5) * 3;
        root.position.y = base.y + h; root.rotation.set(spin * 0.4, spin, spin * 0.3);
        root.scale.setScalar(0.01);
        tm.busy = true;
        promises.push(this.stage.tweens.add(0.7, k => {
          root.position.y = base.y + h * (1 - k);
          root.rotation.set(spin * 0.4 * (1 - k), spin * (1 - k), spin * 0.3 * (1 - k));
          root.scale.setScalar(Math.min(1, 0.01 + k * 2));
        }, { ease: ease.outBounce, delay, tag: 'tile' + t.id }).then(() => { tm.busy = false; root.scale.setScalar(1); root.position.copy(base); root.rotation.set(0, 0, 0); }));
      }
    });
    return Promise.all(promises).then(() => undefined);
  }

  /** Visual state for gold / bomb / lock / mist. */
  applyAttributes(t: TileData, free?: boolean, matches = 0) {
    const m = this.meshes.get(t.id);
    if (!m) return;
    m.gold = t.gold;
    m.bodyMat.color.set(t.gold ? '#ffd76a' : t.bomb ? '#ffb4a4' : '#ffffff');
    m.bodyMat.metalness = t.gold ? 0.45 : 0.02;
    const showBack = t.mist && free === false;
    const want = showBack ? -1 : t.face;
    if (want !== m.shownFace) {
      if (m.shownFace === -1 && want !== -1) this.flipReveal(m, t.face);
      else { m.faceMat.map = want === -1 ? this.atlas.back : this.atlas.textures[want]; m.faceMat.needsUpdate = true; m.shownFace = want; }
    }
    let key = '';
    if (t.bomb) key = 'bomb' + t.bomb;
    else if (t.lock > matches) key = 'lock' + (t.lock - matches);
    if (key !== m.badgeKey) {
      if (m.badge) { m.root.remove(m.badge); (m.badge.material as THREE.SpriteMaterial).map?.dispose(); m.badge.material.dispose(); m.badge = undefined; }
      if (key) {
        const kind = key.startsWith('bomb') ? 'bomb' : 'lock';
        const n = kind === 'bomb' ? t.bomb : t.lock - matches;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(kind, n), depthTest: false, transparent: true }));
        sp.scale.setScalar(0.62);
        sp.position.set(0.32, TH / 2 + 0.45, -0.42);
        sp.renderOrder = 10;
        m.root.add(sp);
        m.badge = sp;
      }
      m.badgeKey = key;
    }
    if (free !== undefined) {
      const lockedOut = t.lock > matches;
      const dim = this.dimBlocked && (!free || lockedOut);
      m.faceMat.color.setScalar(dim ? 0.62 : 1);
      m.bodyMat.color.multiplyScalar(dim ? 0.8 : 1);
    }
  }

  private flipReveal(m: TileMesh, face: number) {
    const tag = 'flip' + m.id;
    let swapped = false;
    this.stage.tweens.add(0.45, k => {
      m.face.scale.x = Math.abs(Math.cos(k * Math.PI));
      if (k > 0.5 && !swapped) { swapped = true; m.faceMat.map = this.atlas.textures[face]; m.faceMat.needsUpdate = true; }
    }, { tag, ease: ease.inOutCubic }).then(() => { m.face.scale.x = 1; });
    m.shownFace = face;
  }

  refreshAll(tiles: TileData[], free: boolean[], matches: number) {
    for (const t of tiles) if (!t.removed) this.applyAttributes(t, free[t.id], matches);
  }

  setSelected(id: number) {
    if (this.selected >= 0) { const m = this.meshes.get(this.selected); if (m) m.liftTarget = 0; }
    this.selected = id;
    if (id >= 0) { const m = this.meshes.get(id); if (m) m.liftTarget = 0.28; }
  }

  setHint(ids: number[]) { this.hintIds = ids; }
  setHover(id: number) { this.hover = id; }

  shakeTile(id: number) {
    const m = this.meshes.get(id); if (!m) return;
    const x0 = m.base.x;
    this.stage.tweens.add(0.35, k => { m.root.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.08 * (1 - k); }, { ease: ease.linear, tag: 'tile' + id })
      .then(() => { m.root.position.x = x0; });
  }

  animateMatch(a: number, b: number, color: string): Promise<void> {
    const ma = this.meshes.get(a), mb = this.meshes.get(b);
    if (!ma || !mb) return Promise.resolve();
    this.setSelected(-1);
    const mid = ma.root.position.clone().add(mb.root.position).multiplyScalar(0.5);
    mid.y = Math.max(ma.root.position.y, mb.root.position.y) + 2.2;
    const run = (m: TileMesh, dir: number) => {
      m.busy = true;
      const p0 = m.root.position.clone();
      const p1 = mid.clone().add(new THREE.Vector3(dir * 0.55, 0, 0));
      const r0 = m.root.rotation.clone();
      return this.stage.tweens.add(0.5, k => {
        const up = p0.clone().lerp(p1, k); up.y += Math.sin(k * Math.PI) * 0.8;
        m.root.position.copy(up);
        m.root.rotation.set(r0.x - k * 1.2, r0.y + dir * k * 0.6, r0.z + dir * k * 0.3);
        m.bodyMat.emissive.set(color).multiplyScalar(k * 0.6);
      }, { ease: ease.inOutCubic, tag: 'tile' + m.id }).then(() =>
        this.stage.tweens.add(0.22, k => { m.root.scale.setScalar(1 - k); m.root.position.x += (mid.x - m.root.position.x) * k; }, { ease: ease.inBack, tag: 'tile' + m.id }));
    };
    return Promise.all([run(ma, -1), run(mb, 1)]).then(() => {
      ma.root.visible = false; mb.root.visible = false;
      ma.hidden = mb.hidden = true;
      this.burst(mid, color, 46);
    });
  }

  restore(id: number) {
    const m = this.meshes.get(id); if (!m) return;
    this.stage.tweens.cancel('tile' + id);
    m.root.visible = true; m.hidden = false;
    m.root.scale.setScalar(1); m.root.rotation.set(0, 0, 0);
    m.bodyMat.emissive.set('#000');
    const from = m.base.clone(); from.y += 3;
    m.root.position.copy(from);
    m.busy = true; m.lift = 0;
    this.stage.tweens.add(0.35, k => { m.root.position.lerpVectors(from, m.base, k); }, { ease: ease.outBounce, tag: 'tile' + id })
      .then(() => { m.busy = false; });
  }

  /** Animated reshuffle: tiles spin up, faces change, settle down. */
  shuffleAnim(tiles: TileData[], free: boolean[], matches: number): Promise<void> {
    const ps: Promise<void>[] = [];
    for (const t of tiles) {
      if (t.removed) continue;
      const m = this.meshes.get(t.id); if (!m) continue;
      const delay = Math.random() * 0.25;
      let swapped = false;
      m.busy = true;
      ps.push(this.stage.tweens.add(0.8, k => {
        m.root.position.y = m.base.y + Math.sin(k * Math.PI) * 2.2;
        m.root.rotation.y = k * Math.PI * 2;
        if (k > 0.5 && !swapped) { swapped = true; m.shownFace = -2; this.applyAttributes(t, free[t.id], matches); }
      }, { delay, ease: ease.inOutCubic, tag: 'tile' + t.id }).then(() => { m.root.rotation.y = 0; m.root.position.copy(m.base); m.busy = false; }));
    }
    return Promise.all(ps).then(() => undefined);
  }

  explode(ids: number[]) {
    for (const id of ids) {
      const m = this.meshes.get(id); if (!m) continue;
      this.burst(m.root.position.clone(), '#ff5a1a', 90);
      m.bodyMat.emissive.set('#ff3a00');
    }
  }

  burst(at: THREE.Vector3, color: string, n: number) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, s = 3 + Math.random() * 5;
      vel[i * 3] = Math.cos(a) * Math.cos(e) * s; vel[i * 3 + 1] = Math.abs(Math.sin(e)) * s + 2; vel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * s;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.3, map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    this.group.add(pts);
    this.sparks.push({ pts, vel, life: 1 });
  }

  fireworks(count = 8) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const p = new THREE.Vector3((Math.random() - 0.5) * 18, 6 + Math.random() * 6, (Math.random() - 0.5) * 12);
        const cols = ['#ffd76a', '#ff6a8a', '#6ad4ff', '#a6ff6a', '#ffffff', this.stage.biome.accent];
        this.burst(p, cols[i % cols.length], 120);
      }, i * 220);
    }
  }

  pick(ndc: THREE.Vector2): number {
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const targets: THREE.Object3D[] = [];
    for (const m of this.meshes.values()) if (m.root.visible && !m.hidden) targets.push(m.body, m.face);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? (hit.object.userData.tileId as number) : -1;
  }

  /** Camera position that frames the current board. */
  /**
   * Places the camera so the whole board fits between the HUD bars: projects the
   * board's bounding box and searches for the closest distance (and a small
   * forward/back target shift) that keeps every corner inside the safe area.
   */
  framing(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const cam = this.stage.camera;
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    const ins = this.safeInsets();
    const safe = { x0: -1 + 2 * ins.left / W, x1: 1 - 2 * ins.right / W, y0: -1 + 2 * ins.bottom / H, y1: 1 - 2 * ins.top / H };
    // Measured on a 390×664 phone: turned boards read best at a lower angle, square ones from higher up.
    const pitch = cam.aspect < 0.8 ? (this.transposed ? 0.95 : 1.3) : 0.96;
    const hw = this.extent.w / 2 + 0.3, hd = this.extent.d / 2 + 0.3;
    const yTop = DAIS_TOP + this.extent.h * TH + 0.3;
    const corners: THREE.Vector3[] = [];
    for (const x of [-hw, hw]) for (const z of [-hd, hd]) for (const y of [DAIS_TOP, yTop]) corners.push(new THREE.Vector3(x, y, z));
    const probe = cam.clone();
    const v = new THREE.Vector3();
    const place = (dist: number, tz: number) => {
      const target = new THREE.Vector3(0, DAIS_TOP + 0.4, tz);
      probe.position.set(0, target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(pitch));
      probe.lookAt(target);
      probe.updateMatrixWorld();
      return target;
    };
    const fits = () => corners.every(c => {
      v.copy(c).project(probe);
      return v.z < 1 && v.x >= safe.x0 && v.x <= safe.x1 && v.y >= safe.y0 && v.y <= safe.y1;
    });
    let best = { dist: 80, tz: 0 };
    for (let tz = -3; tz <= 3.001; tz += 0.5) {
      let lo = 4, hi = 90;
      place(hi, tz);
      if (!fits()) continue;
      for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; place(mid, tz); if (fits()) hi = mid; else lo = mid; }
      if (hi < best.dist) best = { dist: hi, tz };
    }
    const dist = Math.max(best.dist, 9);
    const target = place(dist, best.tz);
    return { pos: probe.position.clone(), target };
  }

  /** On-screen width of one tile in CSS px (diagnostics and tests). */
  tileScreenWidth(): number {
    const cam = this.stage.camera;
    const a = new THREE.Vector3(-TW / 2, DAIS_TOP + TH, 0).project(cam), b = new THREE.Vector3(TW / 2, DAIS_TOP + TH, 0).project(cam);
    return Math.abs(b.x - a.x) / 2 * window.innerWidth;
  }

  /** Nearest tile (by its top-face center on screen) among `ids`, within `radius` CSS px. */
  nearestOnScreen(px: number, py: number, ids: number[], radius: number): number {
    const cam = this.stage.camera;
    const v = new THREE.Vector3();
    let bestId = -1, bestD = radius;
    for (const id of ids) {
      const m = this.meshes.get(id);
      if (!m || m.hidden) continue;
      v.copy(m.base); v.y += TH / 2;
      v.project(cam);
      const d = Math.hypot((v.x + 1) / 2 * window.innerWidth - px, (1 - v.y) / 2 * window.innerHeight - py);
      if (d < bestD) { bestD = d; bestId = id; }
    }
    return bestId;
  }

  /** Point on the board plane under the given NDC coordinate. */
  boardPoint(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(DAIS_TOP + TH));
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  private update(dt: number) {
    this.t += dt;
    for (const m of this.meshes.values()) {
      if (m.hidden || m.busy) continue;
      let target = m.liftTarget;
      if (m.id === this.hover && m.id !== this.selected) target = 0.08;
      m.lift += (target - m.lift) * Math.min(1, dt * 14);
      const isHint = this.hintIds.includes(m.id);
      m.root.position.y = m.base.y + m.lift + (isHint ? Math.abs(Math.sin(this.t * 4)) * 0.18 : 0);
      const e = m.id === this.selected ? 0.38 : isHint ? 0.22 + Math.sin(this.t * 6) * 0.12 : m.id === this.hover ? 0.1 : 0;
      const col = m.id === this.selected ? '#ffcc44' : isHint ? '#44ddff' : '#ffffff';
      if (e === 0 && m.gold) m.bodyMat.emissive.set('#ffaa00').multiplyScalar(0.22 + Math.sin(this.t * 3 + m.id) * 0.1);
      else m.bodyMat.emissive.set(col).multiplyScalar(e);
      m.faceMat.emissive.set(col).multiplyScalar(e * 0.5);
    }
    for (const s of this.sparks) {
      s.life -= dt * 0.9;
      const a = s.pts.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        s.vel[i * 3 + 1] -= 9 * dt;
        a.setXYZ(i, a.getX(i) + s.vel[i * 3] * dt, a.getY(i) + s.vel[i * 3 + 1] * dt, a.getZ(i) + s.vel[i * 3 + 2] * dt);
      }
      a.needsUpdate = true;
      (s.pts.material as THREE.PointsMaterial).opacity = Math.max(0, s.life);
    }
    const dead = this.sparks.filter(s => s.life <= 0);
    for (const s of dead) { this.group.remove(s.pts); s.pts.geometry.dispose(); (s.pts.material as THREE.Material).dispose(); }
    if (dead.length) this.sparks = this.sparks.filter(s => s.life > 0);
  }
}
