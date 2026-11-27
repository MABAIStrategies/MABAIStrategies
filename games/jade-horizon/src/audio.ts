// Synthesized sound effects and generative pentatonic ambience (no audio files).
type Sfx = 'select' | 'match' | 'blocked' | 'hint' | 'shuffle' | 'undo' | 'win' | 'fail' | 'achieve' | 'tick' | 'boom' | 'unlock' | 'reveal' | 'ui' | 'gold' | 'star';

const PENTA = [0, 2, 4, 7, 9];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private delay!: DelayNode;
  private musicTimer = 0;
  private root = 57; // A3
  private padNodes: OscillatorNode[] = [];
  private padGain?: GainNode;
  volume = 0.7; sfxOn = true; musicOn = true;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicOn ? 0.32 : 0; this.musicBus.connect(this.master);
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.38;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.delay.connect(lp); lp.connect(fb); fb.connect(this.delay); lp.connect(this.master);
    this.startMusic();
  }

  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.4);
  }
  setMood(biome: number) {
    const roots = [57, 55, 50, 53, 59, 52, 45, 62];
    this.root = roots[biome % roots.length];
    if (this.ctx && this.padNodes.length) {
      const f = this.mtof(this.root - 12);
      this.padNodes[0].frequency.setTargetAtTime(f, this.ctx.currentTime, 1.5);
      this.padNodes[1].frequency.setTargetAtTime(f * 1.5 * 1.003, this.ctx.currentTime, 1.5);
    }
  }

  private mtof(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, bus?: AudioNode, echo = 0.25, glide?: number) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus ?? this.sfxBus);
    if (echo > 0) { const e = c.createGain(); e.gain.value = echo; g.connect(e); e.connect(this.delay); }
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, freq: number, when = 0, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t);
  }

  play(s: Sfx, combo = 1) {
    if (!this.ctx || !this.sfxOn) return;
    const r = this.root + 12;
    const note = (i: number) => this.mtof(r + PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5));
    switch (s) {
      case 'select': this.tone(1800, 0.05, 'square', 0.03, 0, undefined, 0); this.tone(900, 0.08, 'triangle', 0.12, 0, undefined, 0); break;
      case 'ui': this.tone(1200, 0.06, 'triangle', 0.08, 0, undefined, 0); break;
      case 'match': {
        const base = Math.min(combo - 1, 9);
        this.tone(note(base + 2), 0.6, 'sine', 0.22);
        this.tone(note(base + 4), 0.7, 'triangle', 0.1, 0.06);
        if (combo >= 3) this.tone(note(base + 7), 0.8, 'sine', 0.08, 0.12);
        this.noise(0.12, 0.08, 3000, 0, 2);
        break;
      }
      case 'gold': [0, 2, 4, 7].forEach((k, i) => this.tone(note(k + 5), 0.5, 'sine', 0.14, i * 0.05)); break;
      case 'blocked': this.tone(140, 0.18, 'square', 0.08, 0, undefined, 0, 90); break;
      case 'hint': [7, 9, 12].forEach((k, i) => this.tone(note(k), 0.3, 'sine', 0.1, i * 0.07)); break;
      case 'shuffle': this.noise(0.6, 0.25, 900, 0, 0.6); this.tone(300, 0.6, 'sine', 0.06, 0, undefined, 0.2, 900); break;
      case 'undo': this.tone(700, 0.2, 'triangle', 0.1, 0, undefined, 0.1, 350); break;
      case 'win': [0, 2, 4, 5, 7, 10].forEach((k, i) => this.tone(note(k), 0.9, 'triangle', 0.16, i * 0.11)); this.tone(note(12), 1.6, 'sine', 0.18, 0.7); break;
      case 'fail': [4, 2, 0, -3].forEach((k, i) => this.tone(note(k), 0.6, 'sine', 0.14, i * 0.16)); break;
      case 'achieve': [0, 4, 7, 12].forEach(k => this.tone(note(k + 5), 1.4, 'sine', 0.07)); this.tone(note(17), 1.6, 'triangle', 0.06, 0.15); break;
      case 'star': this.tone(note(combo + 5), 0.5, 'sine', 0.16); this.tone(note(combo + 7), 0.5, 'triangle', 0.08, 0.04); break;
      case 'tick': this.tone(1600, 0.04, 'square', 0.04, 0, undefined, 0); break;
      case 'boom': this.noise(1.2, 0.8, 200, 0, 0.5); this.tone(80, 0.9, 'sine', 0.5, 0, undefined, 0, 30); break;
      case 'unlock': this.tone(2400, 0.15, 'triangle', 0.08, 0, undefined, 0.2); this.tone(3200, 0.2, 'triangle', 0.06, 0.06); break;
      case 'reveal': this.tone(note(9), 0.4, 'sine', 0.06, 0, undefined, 0.4, note(12)); break;
    }
  }

  private startMusic() {
    if (!this.ctx) return;
    const c = this.ctx;
    // Soft pad
    this.padGain = c.createGain(); this.padGain.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 0.03; lfo.connect(lfoG); lfoG.connect(this.padGain.gain); lfo.start();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const f = this.mtof(this.root - 12);
    for (const [mult, type] of [[1, 'sine'], [1.5 * 1.003, 'triangle']] as [number, OscillatorType][]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f * mult; o.connect(lp); o.start();
      this.padNodes.push(o);
    }
    lp.connect(this.padGain); this.padGain.connect(this.musicBus);
    // Generative plucks
    const step = () => {
      if (!this.ctx) return;
      if (this.musicOn) {
        const notes = 1 + Math.floor(Math.random() * 2);
        for (let k = 0; k < notes; k++) {
          const deg = Math.floor(Math.random() * 8);
          const m = this.root + PENTA[deg % 5] + 12 * Math.floor(deg / 5);
          this.tone(this.mtof(m), 1.8 + Math.random(), Math.random() < 0.5 ? 'triangle' : 'sine', 0.05 + Math.random() * 0.04, k * 0.18, this.musicBus, 0.45);
        }
      }
      this.musicTimer = window.setTimeout(step, 900 + Math.random() * 1800);
    };
    step();
  }

  stop() { clearTimeout(this.musicTimer); }
}

export const audio = new Audio();
