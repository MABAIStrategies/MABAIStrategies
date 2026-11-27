// Procedural low-poly 3D landscapes for each realm.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Biome } from './biomes';
import { mulberry32, Rng } from './rng';

export const DAIS_TOP = 1.0;
export const DAIS_RADIUS = 12.5;

// ---------- noise ----------
function makeNoise(seed: number) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x: number, y: number) => vals[perm[(perm[x & 255] + y) & 255]];
  const s = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    const u = s(xf), w = s(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  return (x: number, y: number, oct = 4) => {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- sprite textures ----------
function spriteTexture(kind: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'petals' || kind === 'leaves') {
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(32, 32, 26, 14, 0.6, 0, Math.PI * 2); g.fill();
  } else if (kind === 'snow' || kind === 'dust') {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  } else {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    if (kind === 'stars') { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; ph: number }

export class World {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  private particles: Particle[] = [];
  private points?: THREE.Points;
  private water?: THREE.Mesh;
  private waterBase?: Float32Array;
  private floaters: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private clouds: THREE.Object3D[] = [];
  private flickers: THREE.PointLight[] = [];
  private t = 0;
  private height: (x: number, z: number) => number;
  private rng: Rng;

  constructor(public biome: Biome, quality: 'high' | 'low', seed = 7) {
    this.rng = mulberry32(seed + biome.id * 101);
    const fbm = makeNoise(seed + biome.id * 31);
    this.height = this.makeHeight(fbm);
    const lowQ = quality === 'low';

    // Lights
    const hemi = new THREE.HemisphereLight(biome.hemiSky, biome.hemiGround, biome.hemiIntensity);
    this.group.add(hemi);
    this.sun = new THREE.DirectionalLight(biome.sun, biome.sunIntensity);
    this.sun.position.set(...biome.sunDir);
    this.sun.castShadow = !lowQ;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.group.add(this.sun, this.sun.target);

    this.buildSky();
    if (biome.terrain === 'islands') this.buildIslands(fbm);
    else this.buildTerrain(lowQ);
    if (biome.water) this.buildWater();
    this.buildDais();
    this.buildTrees(lowQ);
    this.buildRocks();
    this.buildLandmark();
    this.buildClouds();
    this.buildParticles(lowQ ? 0.5 : 1);
  }

  private makeHeight(fbm: (x: number, y: number, o?: number) => number) {
    const b = this.biome;
    return (x: number, z: number) => {
      const d = Math.hypot(x, z);
      const mask = smooth(17, 48, d);
      const far = smooth(70, 150, d);
      const n = fbm(x * 0.02 + 10, z * 0.02 - 4);
      const n2 = fbm(x * 0.006 + 3, z * 0.006 + 8, 3);
      let h = 0;
      switch (b.terrain) {
        case 'hills': h = (n * 0.5 + 0.5) * b.amp * mask + far * (n2 * 0.5 + 0.6) * b.amp * 2.4 - mask * 1.5 * (1 - far); break;
        case 'mountains': h = Math.pow(n * 0.5 + 0.5, 1.4) * b.amp * mask + far * (Math.abs(n2) + 0.5) * b.amp * 2.6; break;
        case 'peaks': h = Math.pow(Math.abs(n) + 0.2, 1.3) * b.amp * mask + far * (1 - Math.abs(n2)) * b.amp * 3; break;
        case 'harbor': h = (n * 0.6) * b.amp * mask - mask * 4 * (1 - far) + far * (n2 * 0.5 + 0.6) * b.amp * 3.5; break;
        case 'dunes': h = (Math.sin(x * 0.09 + n * 3) * 0.5 + 0.5) * b.amp * mask + far * (n2 * 0.5 + 0.5) * b.amp * 2.5; break;
        case 'canyon': {
          const raw = (n * 0.5 + 0.5) * mask + far * (n2 * 0.5 + 0.7) * 2.2;
          h = Math.floor(raw * 6) / 6 * b.amp + (raw * 6 % 1) * 0.6;
          break;
        }
        case 'volcanic': h = (Math.abs(n) * 1.2) * b.amp * mask + far * (n2 * 0.5 + 0.7) * b.amp * 2.2 - mask * 0.6; break;
        default: h = 0;
      }
      return h;
    };
  }

  private buildSky() {
    const b = this.biome;
    const geo = new THREE.SphereGeometry(420, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(b.skyTop) }, horizon: { value: new THREE.Color(b.skyHorizon) },
        bottom: { value: new THREE.Color(b.skyBottom) }, sunDir: { value: new THREE.Vector3(...b.sunDir).normalize() },
        sunCol: { value: new THREE.Color(b.sun) }, night: { value: b.night ? 1 : 0 },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
        float s = max(dot(vP, sunDir), 0.0); c += sunCol * (pow(s, 600.0) * (1.0 - night * 0.3) * 1.5 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -10;
    this.group.add(sky);
    if (b.night) {
      const n = 900; const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = this.rng() * Math.PI * 2, v = Math.acos(this.rng() * 0.95);
        arr[i * 3] = Math.sin(v) * Math.cos(u) * 400; arr[i * 3 + 1] = Math.cos(v) * 400; arr[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 400;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
      this.group.add(stars);
    }
  }

  private buildTerrain(lowQ: boolean) {
    const b = this.biome;
    const seg = lowQ ? 110 : 170;
    const geo = new THREE.PlaneGeometry(340, 340, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.height(pos.getX(i), pos.getZ(i)));
    const g2 = geo.toNonIndexed();
    g2.computeVertexNormals();
    const p2 = g2.attributes.position as THREE.BufferAttribute;
    const n2 = g2.attributes.normal as THREE.BufferAttribute;
    const cols = new Float32Array(p2.count * 3);
    const pal = b.ground.map(c => new THREE.Color(c));
    const tmp = new THREE.Color();
    const maxH = b.amp * 2.6;
    for (let i = 0; i < p2.count; i += 3) {
      const y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
      const slope = 1 - n2.getY(i);
      const t = Math.min(1, Math.max(0, y / maxH));
      if (t < 0.25) tmp.copy(pal[0]).lerp(pal[1], t / 0.25);
      else if (t < 0.6) tmp.copy(pal[1]).lerp(pal[2], (t - 0.25) / 0.35);
      else tmp.copy(pal[2]).lerp(pal[3], (t - 0.6) / 0.4);
      if (slope > 0.35) tmp.lerp(pal[2], 0.5);
      if (b.water && y < b.waterLevel + 0.4) tmp.lerp(new THREE.Color('#d8c89a'), 0.5);
      const j = (this.rng() - 0.5) * 0.06;
      for (let k = 0; k < 3; k++) { cols[(i + k) * 3] = tmp.r + j; cols[(i + k) * 3 + 1] = tmp.g + j; cols[(i + k) * 3 + 2] = tmp.b + j; }
    }
    g2.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    if (b.terrain === 'volcanic') { mat.emissive = new THREE.Color('#3a0800'); mat.emissiveIntensity = 0.4; }
    const mesh = new THREE.Mesh(g2, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    geo.dispose();
  }

  private buildIslands(fbm: (x: number, y: number, o?: number) => number) {
    const b = this.biome;
    const mkIsland = (r: number, depth: number, seed: number) => {
      const top = new THREE.CylinderGeometry(r, r * 0.92, 1.2, 9, 1);
      const under = new THREE.ConeGeometry(r * 0.92, depth, 9, 3);
      under.rotateX(Math.PI); under.translate(0, -0.6 - depth / 2, 0);
      const posA = under.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posA.count; i++) {
        const y = posA.getY(i);
        if (y < -0.7) { posA.setX(i, posA.getX(i) * (1 + fbm(i * 0.3, seed) * 0.25)); posA.setZ(i, posA.getZ(i) * (1 + fbm(seed, i * 0.3) * 0.25)); }
      }
      const g = mergeGeometries([top.toNonIndexed(), under.toNonIndexed()])!;
      g.computeVertexNormals();
      const cols = new Float32Array(g.attributes.position.count * 3);
      const ca = new THREE.Color(b.ground[1]), cb = new THREE.Color(b.ground[0]);
      for (let i = 0; i < g.attributes.position.count; i++) {
        const c = g.attributes.position.getY(i) > 0.4 ? ca : cb;
        cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
      m.receiveShadow = true; m.castShadow = true;
      return m;
    };
    const main = mkIsland(19, 22, 1);
    main.position.y = -0.6;
    this.group.add(main);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + this.rng() * 0.3;
      const d = 45 + this.rng() * 90;
      const isl = mkIsland(3 + this.rng() * 9, 6 + this.rng() * 14, i + 2);
      isl.position.set(Math.cos(a) * d, -10 + this.rng() * 40, Math.sin(a) * d);
      isl.userData.bob = this.rng() * Math.PI * 2;
      isl.userData.baseY = isl.position.y;
      this.floaters.push(isl);
      this.group.add(isl);
    }
    this.height = (x, z) => (Math.hypot(x, z) < 18 ? 0 : -999);
  }

  private buildWater() {
    const b = this.biome;
    const geo = new THREE.PlaneGeometry(700, 700, 60, 60);
    geo.rotateX(-Math.PI / 2);
    const lava = b.terrain === 'volcanic';
    const mat = new THREE.MeshStandardMaterial({
      color: b.water!, roughness: lava ? 0.6 : 0.12, metalness: lava ? 0 : 0.25, transparent: !lava, opacity: 0.86,
      flatShading: true, emissive: lava ? new THREE.Color('#ff3a00') : new THREE.Color('#000000'), emissiveIntensity: lava ? 0.9 : 0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = b.waterLevel;
    m.receiveShadow = true;
    this.water = m;
    this.waterBase = new Float32Array((geo.attributes.position as THREE.BufferAttribute).array);
    this.group.add(m);
    if (b.key === 'harbor') {
      // floating lanterns on the water
      const lg = new THREE.SphereGeometry(0.45, 10, 8);
      for (let i = 0; i < 60; i++) {
        const a = this.rng() * Math.PI * 2, d = 20 + this.rng() * 60;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (this.height(x, z) > b.waterLevel - 0.2) continue;
        const mat2 = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff9a2a', emissiveIntensity: 2.2 });
        const l = new THREE.Mesh(lg, mat2);
        l.position.set(x, b.waterLevel + 0.4, z);
        l.userData.bob = this.rng() * 6; l.userData.baseY = l.position.y;
        this.floaters.push(l);
        this.group.add(l);
      }
    }
  }

  private buildDais() {
    const b = this.biome;
    const dais = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(DAIS_RADIUS + 1.2, DAIS_RADIUS + 2.4, 2.4, 8, 1),
      new THREE.MeshStandardMaterial({ color: '#6e6a66', roughness: 0.9, flatShading: true }));
    base.position.y = -1.3; base.rotation.y = Math.PI / 8;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(DAIS_RADIUS + 0.5, DAIS_RADIUS + 0.8, 0.9, 8, 1),
      new THREE.MeshStandardMaterial({ color: b.daisRim, roughness: 0.35, metalness: 0.1, flatShading: true }));
    rim.position.y = DAIS_TOP - 0.62; rim.rotation.y = Math.PI / 8;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(DAIS_RADIUS, DAIS_RADIUS, 0.3, 8, 1),
      new THREE.MeshStandardMaterial({ color: b.daisTop, roughness: 0.55, metalness: 0.05 }));
    top.position.y = DAIS_TOP - 0.15; top.rotation.y = Math.PI / 8;
    for (const m of [base, rim, top]) { m.receiveShadow = true; m.castShadow = true; dais.add(m); }
    // inlay ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(DAIS_RADIUS - 0.9, 0.08, 6, 8),
      new THREE.MeshStandardMaterial({ color: '#d9b45a', metalness: 0.8, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 8; ring.position.y = DAIS_TOP + 0.03;
    dais.add(ring);
    // lantern posts at the octagon corners
    const postGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6);
    const lampGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
    const capGeo = new THREE.ConeGeometry(0.62, 0.45, 4);
    const postMat = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ff9a3a', emissiveIntensity: b.night ? 2.4 : 0.9 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const r = DAIS_RADIUS + 1.9;
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(Math.cos(a) * r, 1.6, Math.sin(a) * r);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(post.position.x, 3.5, post.position.z);
      const cap = new THREE.Mesh(capGeo, postMat);
      cap.position.set(post.position.x, 4.15, post.position.z); cap.rotation.y = Math.PI / 4;
      post.castShadow = true;
      dais.add(post, lamp, cap);
    }
    if (b.night) {
      for (let i = 0; i < 2; i++) {
        const pl = new THREE.PointLight('#ffb070', 30, 40, 1.6);
        pl.position.set(i ? 9 : -9, 6, i ? -6 : 6);
        this.flickers.push(pl);
        dais.add(pl);
      }
    }
    this.group.add(dais);
  }

  private scatter(count: number, minD: number, maxD: number, maxSlopeY = 0.4): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    const b = this.biome;
    let tries = 0;
    while (pts.length < count && tries < count * 12) {
      tries++;
      const a = this.rng() * Math.PI * 2;
      const d = minD + Math.sqrt(this.rng()) * (maxD - minD);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = this.height(x, z);
      if (y < -500) continue;
      if (b.water && y < b.waterLevel + 0.3) continue;
      const dy = Math.abs(this.height(x + 1, z) - y) + Math.abs(this.height(x, z + 1) - y);
      if (dy > maxSlopeY * 4) continue;
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  }

  private buildTrees(lowQ: boolean) {
    const b = this.biome;
    const count = Math.floor(b.treeCount * (lowQ ? 0.5 : 1));
    const islands = b.terrain === 'islands';
    const pts = islands ? this.islandPoints(count) : this.scatter(count, 22, 120);
    let trunk: THREE.BufferGeometry | null = new THREE.CylinderGeometry(0.18, 0.28, 2, 5).translate(0, 1, 0);
    let fol: THREE.BufferGeometry;
    const trunkColor = '#5a3a28';
    switch (b.trees) {
      case 'blossom': fol = new THREE.IcosahedronGeometry(1.5, 0).translate(0, 2.6, 0); break;
      case 'maple': fol = new THREE.DodecahedronGeometry(1.5, 0).translate(0, 2.7, 0); break;
      case 'pine': case 'snowpine': fol = mergeGeometries([
        new THREE.ConeGeometry(1.4, 2.4, 6).translate(0, 2.2, 0),
        new THREE.ConeGeometry(1.0, 2.0, 6).translate(0, 3.4, 0)])!; break;
      case 'bamboo': trunk = null; fol = mergeGeometries([
        new THREE.CylinderGeometry(0.09, 0.11, 7, 5).translate(0, 3.5, 0),
        new THREE.CylinderGeometry(0.09, 0.11, 6, 5).translate(0.4, 3, 0.2),
        new THREE.CylinderGeometry(0.09, 0.11, 8, 5).translate(-0.3, 4, -0.3),
        new THREE.ConeGeometry(0.7, 1.6, 5).translate(0, 7.2, 0),
        new THREE.ConeGeometry(0.6, 1.4, 5).translate(-0.3, 8, -0.3)])!; break;
      case 'cactus': trunk = null; fol = mergeGeometries([
        new THREE.CylinderGeometry(0.35, 0.4, 3, 7).translate(0, 1.5, 0),
        new THREE.CylinderGeometry(0.22, 0.22, 1.2, 6).rotateZ(Math.PI / 2).translate(0.6, 1.4, 0),
        new THREE.CylinderGeometry(0.2, 0.22, 1, 6).translate(1.1, 1.9, 0)])!; break;
      case 'obsidian': trunk = null; fol = new THREE.ConeGeometry(0.8, 5, 5).translate(0, 2.5, 0); break;
      default: trunk = null; fol = new THREE.OctahedronGeometry(1.0, 0).scale(0.7, 2.2, 0.7).translate(0, 2.2, 0);
    }
    const emissive = b.trees === 'crystal';
    const folMat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: emissive ? 0.2 : 0.85, metalness: emissive ? 0.3 : 0,
      emissive: emissive ? new THREE.Color('#5a3aa0') : new THREE.Color(b.trees === 'obsidian' ? '#2a0800' : '#000000'), emissiveIntensity: emissive ? 0.8 : 0.4 });
    const folMesh = new THREE.InstancedMesh(fol, folMat, pts.length);
    const trunkMesh = trunk ? new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: trunkColor, flatShading: true }), pts.length) : null;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const col = new THREE.Color();
    pts.forEach((p, i) => {
      const sc = 0.7 + this.rng() * 0.8;
      q.setFromEuler(new THREE.Euler(0, this.rng() * Math.PI * 2, 0));
      s.set(sc, sc * (0.85 + this.rng() * 0.4), sc);
      m.compose(p, q, s);
      folMesh.setMatrixAt(i, m);
      col.set(b.treeColors[i % b.treeColors.length]);
      if (b.trees === 'snowpine' && this.rng() < 0.5) col.lerp(new THREE.Color('#ffffff'), 0.55);
      folMesh.setColorAt(i, col);
      trunkMesh?.setMatrixAt(i, m);
    });
    folMesh.castShadow = true; folMesh.receiveShadow = true;
    this.group.add(folMesh);
    if (trunkMesh) { trunkMesh.castShadow = true; this.group.add(trunkMesh); }
  }

  private islandPoints(count: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = 15.5 + this.rng() * 3;
      pts.push(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
    }
    // and some on the floating islands
    for (const isl of this.floaters) {
      for (let k = 0; k < 3; k++) {
        const a = this.rng() * Math.PI * 2;
        pts.push(new THREE.Vector3(isl.position.x + Math.cos(a) * 2, isl.position.y + 0.6, isl.position.z + Math.sin(a) * 2));
      }
    }
    return pts;
  }

  private buildRocks() {
    const pts = this.biome.terrain === 'islands' ? [] : this.scatter(70, 20, 110, 1);
    if (!pts.length) return;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: this.biome.ground[2], flatShading: true, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    pts.forEach((p, i) => {
      const sc = 0.4 + this.rng() * 1.6;
      q.setFromEuler(new THREE.Euler(this.rng(), this.rng() * 6, this.rng()));
      s.set(sc, sc * 0.7, sc * 1.1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildLandmark() {
    const b = this.biome;
    const g = new THREE.Group();
    const std = (c: string, e?: string, ei = 0) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.7, emissive: e ?? '#000', emissiveIntensity: ei });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m;
    };
    switch (b.landmark) {
      case 'pagoda': case 'monastery': {
        const wall = std(b.landmark === 'pagoda' ? '#f2e6d0' : '#e8e4dc'), roof = std(b.landmark === 'pagoda' ? '#8a2a2a' : '#3a4a6a');
        let y = 0;
        for (let i = 0; i < 5; i++) {
          const w = 6 - i * 0.9;
          add(new THREE.BoxGeometry(w, 2.2, w), wall, 0, y + 1.1, 0);
          add(new THREE.ConeGeometry(w * 0.95, 1.6, 4), roof, 0, y + 2.9, 0, Math.PI / 4);
          y += 3;
        }
        add(new THREE.CylinderGeometry(0.08, 0.08, 3, 5), std('#d9b45a', '#d9b45a', 0.4), 0, y + 1.5, 0);
        break;
      }
      case 'gate': {
        const red = std('#b8322a');
        add(new THREE.CylinderGeometry(0.6, 0.7, 12, 8), red, -5, 6, 0);
        add(new THREE.CylinderGeometry(0.6, 0.7, 12, 8), red, 5, 6, 0);
        add(new THREE.BoxGeometry(14, 1, 1.4), std('#2a1a14'), 0, 12.3, 0);
        add(new THREE.BoxGeometry(12, 0.8, 1), red, 0, 10, 0);
        break;
      }
      case 'lighthouse': {
        add(new THREE.CylinderGeometry(1.6, 2.4, 14, 10), std('#e8e0d0'), 0, 7, 0);
        add(new THREE.CylinderGeometry(1.4, 1.4, 2, 10), std('#ffe6a0', '#ffcc55', 3), 0, 15, 0);
        add(new THREE.ConeGeometry(1.8, 2, 10), std('#7a2a2a'), 0, 17, 0);
        const beam = new THREE.PointLight('#ffd27a', 120, 80, 1.5); beam.position.set(0, 15, 0); g.add(beam);
        break;
      }
      case 'obelisk': {
        const stone = std('#c99a62');
        add(new THREE.CylinderGeometry(1.2, 2.2, 18, 4), stone, 0, 9, 0, Math.PI / 4);
        add(new THREE.ConeGeometry(1.25, 2.4, 4), std('#e8c35a', '#e8a030', 0.3), 0, 19.2, 0, Math.PI / 4);
        add(new THREE.BoxGeometry(8, 1, 8), stone, 0, 0.5, 0);
        break;
      }
      case 'arch': {
        const arch = new THREE.TorusGeometry(9, 2.2, 6, 14, Math.PI);
        add(arch, std('#a0583a'), 0, 0, 0);
        break;
      }
      case 'forge': {
        add(new THREE.ConeGeometry(26, 34, 9, 2, true), std('#2a1e1c'), 0, 17, 0);
        const crater = add(new THREE.CylinderGeometry(5.5, 5.5, 1, 9), std('#ff4a10', '#ff3a00', 3), 0, 33, 0);
        crater.castShadow = false;
        const glow = new THREE.PointLight('#ff5a20', 300, 140, 1.4); glow.position.set(0, 38, 0); g.add(glow);
        this.flickers.push(glow);
        break;
      }
      case 'spire': {
        const cr = std('#c8b0ff', '#8a5aff', 1.2);
        const s1 = add(new THREE.OctahedronGeometry(3, 0), cr, 0, 14, 0); s1.scale.set(1, 3, 1);
        const s2 = add(new THREE.OctahedronGeometry(1.4, 0), std('#9ae0ff', '#4ab0ff', 1.4), 5, 10, 2); s2.scale.set(1, 2.4, 1);
        this.spinners.push(s1, s2);
        break;
      }
    }
    // Place on a far hill facing the board
    const ang = -Math.PI / 2 + (this.rng() - 0.5) * 0.9;
    const d = b.landmark === 'forge' ? 120 : 78;
    const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
    const y = b.terrain === 'islands' ? -4 : Math.max(this.height(x, z), b.water ? b.waterLevel : -99);
    g.position.set(x, y, z);
    g.scale.setScalar(b.landmark === 'forge' ? 1 : 1.6);
    g.lookAt(0, y, 0);
    this.group.add(g);
  }

  private buildClouds() {
    const b = this.biome;
    if (b.key === 'forge') return;
    const mat = new THREE.MeshStandardMaterial({ color: b.night ? '#6a5a9a' : '#ffffff', flatShading: true, transparent: true, opacity: b.night ? 0.35 : 0.8, roughness: 1 });
    const n = b.terrain === 'islands' ? 26 : 12;
    for (let i = 0; i < n; i++) {
      const parts: THREE.BufferGeometry[] = [];
      const k = 3 + Math.floor(this.rng() * 4);
      for (let j = 0; j < k; j++) parts.push(new THREE.IcosahedronGeometry(2 + this.rng() * 3, 0).translate(j * 3 - k * 1.5, this.rng() * 1.5, this.rng() * 2));
      const cloud = new THREE.Mesh(mergeGeometries(parts)!, mat);
      cloud.scale.set(1.6, 0.6, 1);
      const a = this.rng() * Math.PI * 2, d = 60 + this.rng() * 140;
      const y = b.terrain === 'islands' ? -30 + this.rng() * 50 : 45 + this.rng() * 35;
      cloud.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      cloud.userData.speed = 0.6 + this.rng();
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  private buildParticles(scale: number) {
    const b = this.biome;
    const n = Math.floor(b.particleCount * scale);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p: Particle = { x: (this.rng() - 0.5) * 80, y: this.rng() * 30, z: (this.rng() - 0.5) * 80, vx: 0, vy: 0, vz: 0, ph: this.rng() * 10 };
      this.resetParticle(p, true);
      this.particles.push(p);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const additive = ['fireflies', 'embers', 'stars'].includes(b.particles);
    const size = { petals: 0.55, leaves: 0.7, snow: 0.35, dust: 0.3, fireflies: 0.45, embers: 0.35, stars: 0.5 }[b.particles];
    const mat = new THREE.PointsMaterial({
      color: b.particleColor, size, map: spriteTexture(b.particles), transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0.9,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  private resetParticle(p: Particle, initial = false) {
    const r = this.rng;
    p.x = (r() - 0.5) * 80; p.z = (r() - 0.5) * 80;
    switch (this.biome.particles) {
      case 'petals': case 'leaves': p.y = initial ? r() * 28 : 28; p.vx = 0.8 + r(); p.vy = -(0.8 + r() * 0.8); p.vz = (r() - 0.5); break;
      case 'snow': p.y = initial ? r() * 28 : 28; p.vx = 0.3; p.vy = -(1 + r()); p.vz = 0.2; break;
      case 'dust': p.y = r() * 6 + 0.5; p.vx = 3 + r() * 3; p.vy = 0; p.vz = (r() - 0.5); break;
      case 'embers': p.y = initial ? r() * 20 : 0; p.vx = (r() - 0.5) * 0.5; p.vy = 1.2 + r() * 2; p.vz = (r() - 0.5) * 0.5; break;
      default: p.y = 1 + r() * 14; p.vx = (r() - 0.5) * 0.6; p.vy = (r() - 0.5) * 0.3; p.vz = (r() - 0.5) * 0.6;
    }
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    if (this.points) {
      const arr = (this.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const kind = this.biome.particles;
      this.particles.forEach((p, i) => {
        const sway = Math.sin(t * 1.3 + p.ph);
        p.x += (p.vx + (kind === 'petals' || kind === 'leaves' ? sway * 0.8 : 0)) * dt;
        p.y += (p.vy + (kind === 'fireflies' || kind === 'stars' ? Math.sin(t * 0.7 + p.ph) * 0.3 : 0)) * dt;
        p.z += (p.vz + (kind === 'snow' ? sway * 0.3 : 0)) * dt;
        if (p.y < 0 || p.y > 32 || Math.abs(p.x) > 42 || Math.abs(p.z) > 42) this.resetParticle(p);
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      });
      this.points.geometry.attributes.position.needsUpdate = true;
      if (kind === 'fireflies' || kind === 'stars') (this.points.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 2) * 0.3;
    }
    if (this.water && this.waterBase) {
      const pa = this.water.geometry.attributes.position as THREE.BufferAttribute;
      const base = this.waterBase;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        pa.setY(i, Math.sin(x * 0.08 + t * 0.9) * 0.18 + Math.cos(z * 0.1 + t * 0.7) * 0.18);
      }
      pa.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
    for (const f of this.floaters) f.position.y = f.userData.baseY + Math.sin(t * 0.8 + f.userData.bob) * (this.biome.terrain === 'islands' ? 1.2 : 0.15);
    for (const s of this.spinners) s.rotation.y += dt * 0.4;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 200) c.position.x = -200;
    }
    this.flickers.forEach((l, i) => { l.intensity = (l.userData.base ??= l.intensity) * (0.85 + Math.sin(t * 9 + i * 3) * 0.08 + Math.sin(t * 23 + i) * 0.05); });
  }

  dispose() {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
    });
  }
}
