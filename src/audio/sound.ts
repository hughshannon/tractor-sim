import type { ImplementKind } from '../sim/equipment';
import type { GameEvent } from '../sim/game';

const MUTE_KEY = 'tractor-sim:muted';

export interface EngineParams {
  /** 0..1 engine load from speed and throttle. */
  rpm: number;
  /** Extra load when an implement is working. */
  load: number;
  /** Which implement is currently engaging the ground, if any. */
  working: ImplementKind | null;
  /** Absolute ground speed in m/s (scales work noise). */
  speed: number;
}

interface WorkVoice {
  gain: GainNode;
  filter: BiquadFilterNode;
}

/**
 * All sounds are synthesised with the Web Audio API: no audio files.
 * The AudioContext is created on the first user gesture (browser autoplay policy).
 */
export class SoundEngine {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private noise!: AudioBuffer;
  // Engine voice.
  private engOsc1!: OscillatorNode;
  private engOsc2!: OscillatorNode;
  private engLfo!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  // Work voices.
  private work = new Map<ImplementKind, WorkVoice>();
  private whir!: GainNode;
  // Ambience.
  private windFilter!: BiquadFilterNode;
  private nextBird = 0;

  constructor() {
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('pointerdown', unlock);
      }
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  get started(): boolean {
    return this.ctx !== null;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  private start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // master → compressor → speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);

    // 2 seconds of white noise, reused by every noise-based voice.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.buildEngine(ctx);
    this.buildWork(ctx);
    this.buildAmbience(ctx);
    this.setEngine({ rpm: 0, load: 0, working: null, speed: 0 }, true);
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  /** Diesel engine: detuned saw + square, low-passed, amplitude-modulated by a "firing" LFO. */
  private buildEngine(ctx: AudioContext): void {
    this.engOsc1 = ctx.createOscillator();
    this.engOsc1.type = 'sawtooth';
    this.engOsc2 = ctx.createOscillator();
    this.engOsc2.type = 'square';
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.Q.value = 3;

    // Firing pulses: an LFO modulates a gain stage around 0.7 ± 0.3.
    const chug = ctx.createGain();
    chug.gain.value = 0.7;
    this.engLfo = ctx.createOscillator();
    this.engLfo.type = 'sine';
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    this.engLfo.connect(lfoDepth).connect(chug.gain);

    const mix2 = ctx.createGain();
    mix2.gain.value = 0.5;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;

    this.engOsc1.connect(this.engFilter);
    this.engOsc2.connect(mix2).connect(this.engFilter);
    this.engFilter.connect(chug).connect(this.engGain).connect(this.master);

    // A little exhaust hiss on top.
    const hiss = this.noiseSource(ctx);
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 180;
    hissFilter.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.35;
    hiss.connect(hissFilter).connect(hissGain).connect(chug);

    for (const o of [this.engOsc1, this.engOsc2, this.engLfo, hiss]) o.start();
  }

  private buildWork(ctx: AudioContext): void {
    const voice = (type: BiquadFilterType, freq: number, q: number): WorkVoice => {
      const src = this.noiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      return { gain, filter };
    };
    this.work.set('plow', voice('lowpass', 320, 1.5)); // soil rumble
    this.work.set('seeder', voice('bandpass', 3200, 1.2)); // seed rattle
    this.work.set('harvester', voice('bandpass', 1100, 0.6)); // cutting / threshing

    // Mechanical whir for the harvester reel.
    const whirOsc = ctx.createOscillator();
    whirOsc.type = 'triangle';
    whirOsc.frequency.value = 140;
    this.whir = ctx.createGain();
    this.whir.gain.value = 0;
    whirOsc.connect(this.whir).connect(this.master);
    whirOsc.start();
  }

  private buildAmbience(ctx: AudioContext): void {
    const wind = this.noiseSource(ctx);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    const g = ctx.createGain();
    g.gain.value = 0.04;
    wind.connect(this.windFilter).connect(g).connect(this.master);
    wind.start();
    this.nextBird = ctx.currentTime + 2;
  }

  /** Call every frame with the current engine state. */
  update(p: EngineParams): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.setEngine(p, false);
    const t = this.ctx.currentTime;

    // Wind gusts.
    this.windFilter.frequency.setTargetAtTime(300 + 250 * Math.sin(t * 0.23) + 120 * Math.sin(t * 0.71), t, 0.5);

    // Occasional birdsong.
    if (t >= this.nextBird) {
      this.bird(t);
      this.nextBird = t + 3 + Math.random() * 7;
    }
  }

  private setEngine(p: EngineParams, immediate: boolean): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const tc = immediate ? 0 : 0.12;
    const set = (param: AudioParam, v: number, k = tc) => (k === 0 ? param.setValueAtTime(v, t) : param.setTargetAtTime(v, t, k));
    const rpm = Math.max(0, Math.min(1, p.rpm));
    const load = Math.max(0, Math.min(1, p.load));
    const f = 46 + rpm * 74 - load * 5;
    set(this.engOsc1.frequency, f);
    set(this.engOsc2.frequency, f * 0.502);
    set(this.engLfo.frequency, f / 2);
    set(this.engFilter.frequency, 220 + rpm * 700 + load * 250);
    set(this.engGain.gain, 0.11 + rpm * 0.1 + load * 0.06);

    const speedK = Math.min(1, p.speed / 5);
    const levels: Record<ImplementKind, number> = { plow: 0.5, seeder: 0.07, harvester: 0.16 };
    for (const [kind, v] of this.work) {
      set(v.gain.gain, p.working === kind ? levels[kind] * (0.4 + 0.6 * speedK) : 0, 0.15);
    }
    set(this.whir.gain, p.working === 'harvester' ? 0.03 : 0, 0.2);
  }

  // ---- One-shot effects -------------------------------------------------

  play(e: GameEvent): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (e) {
      case 'sell':
        // Cash register: a quick rising pair of bells.
        this.tone(1318, t, 0.5, 0.18, 'triangle');
        this.tone(1760, t + 0.09, 0.7, 0.18, 'triangle');
        this.tone(2637, t + 0.09, 0.5, 0.06, 'sine');
        this.noiseBurst(t, 0.05, 4000, 0.15, 'highpass');
        break;
      case 'buy':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.25, 0.12, 'square'));
        break;
      case 'refuel':
        // Glugging: a few low filtered noise bursts.
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.11, 0.08, 350 + Math.random() * 150, 0.4, 'bandpass');
        this.tone(900, t + 0.75, 0.15, 0.08, 'sine');
        break;
      case 'attach':
        // Metallic clunk.
        this.noiseBurst(t, 0.06, 2200, 0.25, 'bandpass');
        this.tone(180, t, 0.18, 0.2, 'square', 90);
        break;
      case 'lower':
      case 'raise':
        this.hydraulic(t, e === 'raise');
        break;
      case 'bump':
        this.tone(90, t, 0.3, 0.5, 'sine', 40);
        this.noiseBurst(t, 0.12, 600, 0.4, 'lowpass');
        break;
      case 'warn':
        this.tone(440, t, 0.12, 0.12, 'square');
        this.tone(330, t + 0.14, 0.18, 0.12, 'square');
        break;
    }
  }

  /** Short enveloped oscillator, optionally sliding to `toFreq`. */
  private tone(freq: number, at: number, dur: number, vol: number, type: OscillatorType, toFreq?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.sfx);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private noiseBurst(at: number, dur: number, freq: number, vol: number, type: BiquadFilterType): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
  }

  /** Hydraulic hiss sweeping up (raise) or down (lower). */
  private hydraulic(at: number, up: boolean): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(up ? 500 : 1400, at);
    f.frequency.exponentialRampToValueAtTime(up ? 1400 : 500, at + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.35, at + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(at, Math.random());
    src.stop(at + 0.6);
    if (!up) this.tone(120, at + 0.45, 0.15, 0.15, 'sine', 70); // thunk as it hits the ground
  }

  /** A short chirpy phrase from a distant bird. */
  private bird(at: number): void {
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < notes; i++) {
      const s = at + i * (0.09 + Math.random() * 0.05);
      const f = base * (0.9 + Math.random() * 0.25);
      this.tone(f, s, 0.07, 0.025, 'sine', f * (Math.random() < 0.5 ? 1.3 : 0.8));
    }
  }
}
