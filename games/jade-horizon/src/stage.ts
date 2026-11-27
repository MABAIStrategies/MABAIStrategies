// Renderer, post-processing, camera motion and the tween system.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BIOMES, Biome } from './biomes';
import { World } from './world';

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outBounce: (t: number) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

interface Tween { t: number; dur: number; delay: number; fn: (k: number) => void; ease: (t: number) => number; done: () => void; tag?: string; cancelled?: boolean }

export class Tweens {
  private list: Tween[] = [];
  add(dur: number, fn: (k: number) => void, opts: { ease?: (t: number) => number; delay?: number; tag?: string } = {}): Promise<void> {
    return new Promise(res => {
      this.list.push({ t: 0, dur: Math.max(0.0001, dur), delay: opts.delay ?? 0, fn, ease: opts.ease ?? ease.outCubic, done: res, tag: opts.tag });
    });
  }
  cancel(tag: string) {
    for (const tw of this.list) if (tw.tag === tag) { tw.cancelled = true; tw.done(); }
    this.list = this.list.filter(t => !t.cancelled);
  }
  update(dt: number) {
    const finished: Tween[] = [];
    for (const tw of this.list) {
      if (tw.delay > 0) { tw.delay -= dt; if (tw.delay > 0) continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(tw.ease(k));
      if (k >= 1) finished.push(tw);
    }
    if (finished.length) {
      this.list = this.list.filter(t => !finished.includes(t));
      finished.forEach(t => t.done());
    }
  }
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1 }, vignette: { value: 0.35 }, flash: { value: new THREE.Vector4(0, 0, 0, 0) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation; uniform float vignette; uniform vec4 flash; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    c.rgb = mix(vec3(l) * vec3(0.96, 0.97, 1.02), c.rgb, saturation);
    float d = distance(vUv, vec2(0.5)); c.rgb *= 1.0 - vignette * smoothstep(0.35, 0.85, d);
    c.rgb = mix(c.rgb, flash.rgb, flash.a);
    gl_FragColor = c; }`,
};

export type Quality = 'high' | 'low';

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  tweens = new Tweens();
  world: World | null = null;
  biome: Biome = BIOMES[0];
  boardRoot = new THREE.Group();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private clock = new THREE.Clock();
  private cinematic = true;
  private cineAngle = 0;
  private shake = 0;
  quality: Quality;
  onFrame: ((dt: number) => void)[] = [];
  saturation = 1;

  constructor(private canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
    this.camera.position.set(0, 40, 60);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.3;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 70;
    this.controls.enabled = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.scene.add(this.boardRoot);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.setQuality(quality);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    this.renderer.shadowMap.enabled = q === 'high';
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 60 : 45;
    this.camera.updateProjectionMatrix();
  }

  setBiome(id: number, force = false) {
    if (!force && this.world && this.biome.id === id) return;
    this.biome = BIOMES[id];
    if (this.world) { this.scene.remove(this.world.group); this.world.dispose(); }
    this.world = new World(this.biome, this.quality);
    this.scene.add(this.world.group);
    this.scene.fog = new THREE.FogExp2(this.biome.fog, this.biome.fogDensity);
    this.scene.background = new THREE.Color(this.biome.skyHorizon);
    this.renderer.toneMappingExposure = this.biome.night ? 1.15 : 1.0;
    this.bloom.strength = this.biome.night ? 0.75 : 0.38;
    document.documentElement.style.setProperty('--accent', this.biome.accent);
    document.documentElement.style.setProperty('--accent2', this.biome.accent2);
  }

  setCinematic(on: boolean) {
    this.cinematic = on;
    this.controls.enabled = !on;
    if (on) this.cineAngle = Math.atan2(this.camera.position.z, this.camera.position.x);
  }

  /** Smooth camera flight to a position/target. */
  flyTo(pos: THREE.Vector3, target: THREE.Vector3, dur = 1.6): Promise<void> {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const mid = p0.clone().lerp(pos, 0.5); mid.y += Math.max(4, p0.distanceTo(pos) * 0.15);
    return this.tweens.add(dur, k => {
      // quadratic bezier arc for a swooping move
      const a = p0.clone().lerp(mid, k), b = mid.clone().lerp(pos, k);
      this.camera.position.copy(a.lerp(b, k));
      this.controls.target.copy(t0.clone().lerp(target, k));
      this.camera.lookAt(this.controls.target);
    }, { ease: ease.inOutCubic, tag: 'camera' });
  }

  doShake(amount: number) { this.shake = Math.max(this.shake, amount); }

  flash(color: string, strength = 0.6, dur = 0.5) {
    const c = new THREE.Color(color);
    const u = this.grade.uniforms.flash.value as THREE.Vector4;
    return this.tweens.add(dur, k => u.set(c.r, c.g, c.b, strength * (1 - k)), { ease: ease.outCubic });
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.tweens.update(dt);
    if (this.cinematic) {
      this.cineAngle += dt * 0.06;
      const r = 46, y = 20 + Math.sin(this.cineAngle * 1.7) * 4;
      const target = new THREE.Vector3(Math.cos(this.cineAngle) * r, y, Math.sin(this.cineAngle) * r);
      this.camera.position.lerp(target, Math.min(1, dt * 0.8));
      this.controls.target.lerp(new THREE.Vector3(0, 3, 0), Math.min(1, dt * 2));
      this.camera.lookAt(this.controls.target);
    } else if (this.controls.enabled) {
      this.controls.update();
    }
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.world?.update(dt);
    for (const f of this.onFrame) f(dt);
    (this.grade.uniforms.saturation as { value: number }).value += (this.saturation - this.grade.uniforms.saturation.value) * Math.min(1, dt * 2.5);
    if (this.quality === 'high') this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
