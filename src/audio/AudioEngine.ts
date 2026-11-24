import { readFile } from "@tauri-apps/plugin-fs";

export type RepeatMode = "off" | "all" | "one";
export interface Track { path: string; name: string }

export const EQ_FREQS = [60, 250, 1000, 4000, 12000];
const EQ_TYPES: BiquadFilterType[] = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"];

export const EQ_PRESETS: Record<string, number[]> = {
  "Düz (Flat)": [0, 0, 0, 0, 0],
  "Bas Artırma": [6, 4, 0, -1, -2],
  "Vokal / Akustik": [-2, 0, 4, 3, 1],
  "Tiz (Treble)": [-2, -1, 0, 4, 6],
  "Elektronik / Dans": [5, 3, -1, 2, 4],
  "Rock / Metal": [4, 2, -2, 3, 5],
  "Pop": [1, 3, 4, 3, 1],
};

interface Slot {
  track: Track; buffer: AudioBuffer; source: AudioBufferSourceNode;
  gain: GainNode; startCtx: number; offset: number;
}

const CURVE_N = 512;
/** Equal-power curves: out = cos(t·π/2), in = sin(t·π/2) */
export const FADE_OUT = new Float32Array(CURVE_N);
export const FADE_IN = new Float32Array(CURVE_N);
for (let i = 0; i < CURVE_N; i++) {
  const t = i / (CURVE_N - 1);
  FADE_OUT[i] = Math.cos(t * Math.PI / 2);
  FADE_IN[i] = Math.sin(t * Math.PI / 2);
}

const LOOKAHEAD = 1.0; // seconds before transition at which the next source is scheduled
const MIME_HINT = /\.(mp3|wav|flac|aac|m4a|ogg|oga|opus|webm)$/i;
export const isAudio = (n: string) => MIME_HINT.test(n);

export class AudioEngine {
  private ctx = new AudioContext({ latencyHint: "playback" });
  private master = this.ctx.createGain();
  private cache = new Map<string, Promise<AudioBuffer>>();
  private listeners = new Set<() => void>();
  private cur: Slot | null = null;
  private nxt: Slot | null = null;
  private fadingOut: Slot | null = null;
  private fadingOutUntil = 0;
  private rapidSwitchUntil = 0;
  private pendingTrack: Track | null = null;
  private nxtPos = -1;
  private gen = 0;               // invalidates async work after seek/skip
  private scheduling = false;
  private timer = window.setInterval(() => this.tick(), 100);

  queue: Track[] = [];
  order: number[] = [];          // play order (shuffled or sequential)
  pos = 0;                       // index into `order`
  shuffle = false;
  repeat: RepeatMode = "off";
  /** Total cross-fade setting X in seconds. Each side fades for X/2. Default 0. */
  crossfade = 0;
  playing = false;

  volume: number = (() => {
    try {
      const v = Number(localStorage.getItem("volume"));
      return !isNaN(v) && v >= 0 && v <= 1 ? v : 1;
    } catch {
      return 1;
    }
  })();
  private prevVolume = 1;

  // Ekolayzır ve Görselleştirici
  private eqFilters: BiquadFilterNode[] = [];
  eqGains: number[] = (() => {
    try {
      const s = localStorage.getItem("eq_gains");
      return s ? JSON.parse(s) : [0, 0, 0, 0, 0];
    } catch {
      return [0, 0, 0, 0, 0];
    }
  })();
  analyser: AnalyserNode;

  constructor() {
    this.master.gain.value = this.volume;

    // 5-Bant Ekolayzır oluştur
    this.eqFilters = EQ_FREQS.map((freq, i) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = EQ_TYPES[i];
      filter.frequency.value = freq;
      filter.gain.value = this.eqGains[i] ?? 0;
      return filter;
    });

    // Ses Görselleştirici (Analyser) oluştur
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.8;

    // Bağlantı zinciri: master -> eq[0] -> ... -> eq[4] -> analyser -> hoparlör
    let lastNode: AudioNode = this.master;
    for (const filter of this.eqFilters) {
      lastNode.connect(filter);
      lastNode = filter;
    }
    lastNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  setEqGain(index: number, val: number) {
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.value = val;
      this.eqGains[index] = val;
      localStorage.setItem("eq_gains", JSON.stringify(this.eqGains));
      this.emit();
    }
  }

  applyEqPreset(presetName: string) {
    const p = EQ_PRESETS[presetName];
    if (p) {
      p.forEach((val, i) => this.setEqGain(i, val));
    }
  }

  getFrequencyData(array: Uint8Array) {
    this.analyser.getByteFrequencyData(array as any);
  }

  // ---------- state / events ----------
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(f => f()); }
  get track() { return this.pendingTrack ?? this.cur?.track ?? null; }
  get duration() {
    if (this.pendingTrack && this.cur?.track.path !== this.pendingTrack.path) return 0;
    return this.cur?.buffer.duration ?? 0;
  }
  get currentTime() {
    if (!this.cur) return 0;
    if (this.pendingTrack && this.cur.track.path !== this.pendingTrack.path) return 0;
    const t = this.ctx.currentTime - this.cur.startCtx + this.cur.offset;
    return Math.min(Math.max(t, 0), this.duration);
  }
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.master.gain.value = this.volume;
    localStorage.setItem("volume", String(this.volume));
    this.emit();
  }
  toggleMute() {
    if (this.volume > 0) {
      this.prevVolume = this.volume;
      this.setVolume(0);
    } else {
      this.setVolume(this.prevVolume > 0 ? this.prevVolume : 1);
    }
  }

  // ---------- loading ----------
  private load(track: Track, expectedGen?: number): Promise<AudioBuffer> {
    let p = this.cache.get(track.path);
    if (!p) {
      p = readFile(track.path).then(bytes => {
        // Kullanıcı bu sırada başka bir şarkıya geçtiyse boşuna decode edip CPU'yu yorma
        if (expectedGen !== undefined && expectedGen !== this.gen) {
          this.cache.delete(track.path);
          throw new Error("stale");
        }
        return this.ctx.decodeAudioData(bytes.buffer as ArrayBuffer);
      });
      this.cache.set(track.path, p);
      p.catch(() => this.cache.delete(track.path));
      // keep cache small (decoded PCM is large)
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  // ---------- queue ----------
  private buildOrder(first: number) {
    const idx = this.queue.map((_, i) => i);
    if (!this.shuffle) { this.order = idx; this.pos = first; return; }
    const rest = idx.filter(i => i !== first);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.order = [first, ...rest]; this.pos = 0;
  }

  async setQueue(tracks: Track[], startIndex = 0) {
    this.queue = tracks;
    this.buildOrder(startIndex);
    await this.playAt(this.pos);
  }

  addToQueue(track: Track) {
    this.queue.push(track);
    this.order.push(this.queue.length - 1);
    this.invalidateNext();
    this.emit();
  }

  playNext(track: Track) {
    this.queue.push(track);
    const newIdx = this.queue.length - 1;
    this.order.splice(this.pos + 1, 0, newIdx);
    this.invalidateNext();
    this.emit();
  }

  removeFromQueue(orderIndex: number) {
    if (orderIndex === this.pos) return;
    this.order.splice(orderIndex, 1);
    if (orderIndex < this.pos) this.pos--;
    this.invalidateNext();
    this.emit();
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.buildOrder(this.order[this.pos] ?? 0);
    this.invalidateNext();
    this.emit();
  }
  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    this.invalidateNext();
    this.emit();
  }
  setCrossfade(x: number) { this.crossfade = Math.max(0, x); this.invalidateNext(); }

  private nextPos(): number {
    if (this.repeat === "one") return this.pos;
    if (this.pos + 1 < this.order.length) return this.pos + 1;
    return this.repeat === "all" ? 0 : -1;
  }

  // ---------- slots ----------
  private makeSlot(track: Track, buffer: AudioBuffer, when: number, offset: number,
                   fadeIn?: { dur: number }): Slot {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    source.connect(gain).connect(this.master);
    if (fadeIn && fadeIn.dur > 0) {
      gain.gain.setValueAtTime(0, 0);
      gain.gain.setValueCurveAtTime(FADE_IN, when, fadeIn.dur);
    }
    source.start(when, offset);
    const slot: Slot = { track, buffer, source, gain, startCtx: when, offset };
    source.onended = () => this.onEnded(slot);
    return slot;
  }

  private killSlot(s: Slot | null, fadeDur = 0.02) {
    if (!s) return;
    s.source.onended = null;
    const t = this.ctx.currentTime;
    const g = s.gain.gain;
    if (fadeDur > 0.05) {
      // Manuel şarkı değişiminde yumuşak (equal-power) fade-out
      const startVal = Math.max(0.0001, g.value);
      const curve = new Float32Array(CURVE_N);
      for (let i = 0; i < CURVE_N; i++) {
        curve[i] = startVal * FADE_OUT[i];
      }
      if ("cancelAndHoldAtTime" in g && typeof (g as any).cancelAndHoldAtTime === "function") {
        (g as any).cancelAndHoldAtTime(t);
      } else {
        g.cancelScheduledValues(t);
      }
      try {
        g.setValueCurveAtTime(curve, t + 0.005, fadeDur);
      } catch {
        g.setValueAtTime(startVal, t);
        g.linearRampToValueAtTime(0, t + fadeDur);
      }
      try { s.source.stop(t + fadeDur + 0.05); } catch { /* not started */ }
    } else if (fadeDur > 0) {
      // 20 ms de-click ramp (seek vb. için)
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fadeDur);
      try { s.source.stop(t + fadeDur + 0.01); } catch { /* not started */ }
    } else {
      try { s.source.stop(); } catch { /* */ }
    }
  }

  private invalidateNext() {
    this.gen++;
    if (this.nxt) {
      // Un-schedule the pending next track and restore the current gain to 1
      this.killSlot(this.nxt, 0); this.nxt = null;
      if (this.cur) {
        const g = this.cur.gain.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t); g.setValueAtTime(1, t);
      }
    }
  }

  // ---------- transport ----------
  async playAt(pos: number, offset = 0, isSeek = false) {
    const myGen = ++this.gen;
    const track = this.queue[this.order[pos]];
    if (!track) return;

    const nowMs = performance.now();
    // Eğer zaten bir manuel cross-fade devam ediyorsa veya son geçişten bu yana 1.8 sn geçmediyse
    // bu 2. (veya daha sonraki) ardışık şarkı değişimidir -> manuel cross-fade yapma, sesleri hemen kes!
    const isConsecutiveSwitch =
      !isSeek && (nowMs < this.rapidSwitchUntil || this.ctx.currentTime < this.fadingOutUntil);
    if (!isSeek) {
      this.rapidSwitchUntil = nowMs + 1800;
    }

    // Varsa arkada kısılıyor olan eski şarkıyı anında sustur (seslerin üst üste binmesini engeller)
    if (this.fadingOut) {
      this.killSlot(this.fadingOut, 0);
      this.fadingOut = null;
      this.fadingOutUntil = 0;
    }

    // Ardışık (2. ve sonrası) şarkı atlamada mevcut şarkıyı da beklemeden hemen sustur
    if (isConsecutiveSwitch && this.cur) {
      this.killSlot(this.cur, 0.015);
      this.cur = null;
    }
    if (this.nxt) {
      this.killSlot(this.nxt, 0);
      this.nxt = null;
    }

    // Pozisyonu ve şarkı bilgisini anında güncelle (art arda geçişlerde takılmayı önler)
    this.pos = pos;
    if (!isSeek) {
      this.pendingTrack = track;
      this.emit();
    }

    let buffer: AudioBuffer;
    try {
      buffer = await this.load(track, myGen);
    } catch {
      return;
    }
    if (myGen !== this.gen) return;

    const wasPlaying = Boolean(this.cur && this.playing && this.ctx.state === "running");
    // Yalnızca İLK manuel şarkı geçişinde cross-fade uygula; 2. ve sonraki hızlı geçişlerde uygulama
    const rawManualFade = this.crossfade > 0 ? Math.min(Math.max(this.crossfade / 2, 0.8), 2.5) : 1.0;
    const manualFade =
      !isSeek && !isConsecutiveSwitch && wasPlaying
        ? Math.min(rawManualFade, buffer.duration / 2)
        : 0;

    if (this.fadingOut) {
      this.killSlot(this.fadingOut, 0);
      this.fadingOut = null;
      this.fadingOutUntil = 0;
    }

    if (this.cur) {
      if (manualFade > 0.05) {
        this.fadingOut = this.cur;
        this.fadingOutUntil = this.ctx.currentTime + manualFade;
        this.killSlot(this.cur, manualFade);
      } else {
        this.killSlot(this.cur, 0.015);
      }
      this.cur = null;
    }

    await this.ctx.resume();
    if (myGen !== this.gen) return;

    const startWhen = this.ctx.currentTime + 0.02;
    this.pendingTrack = null;
    this.cur = this.makeSlot(
      track,
      buffer,
      startWhen,
      offset,
      manualFade > 0.05 ? { dur: manualFade } : undefined
    );
    this.playing = true;
    this.emit();
  }

  async toggle() {
    if (!this.cur) return;
    if (this.ctx.state === "running") { await this.ctx.suspend(); this.playing = false; }
    else { await this.ctx.resume(); this.playing = true; }
    this.emit();
  }
  seek(t: number) { if (this.cur) this.playAt(this.pos, Math.min(Math.max(t, 0), this.duration - 0.05), true); }
  next() {
    const n = this.repeat === "one" ? (this.pos + 1) % this.order.length
      : this.pos + 1 < this.order.length ? this.pos + 1 : this.repeat === "all" ? 0 : -1;
    if (n >= 0) this.playAt(n);
  }
  prev() {
    if (this.currentTime > 3) this.seek(0);
    else this.playAt(this.pos > 0 ? this.pos - 1 : this.repeat === "all" ? this.order.length - 1 : 0);
  }

  // ---------- scheduler ----------
  /** Effective fade length D = X/2, clamped so short tracks stay valid. */
  private fadeLen(remaining: number, nextBuf: AudioBuffer) {
    return Math.max(0, Math.min(this.crossfade / 2, remaining, nextBuf.duration / 2));
  }

  private tick() {
    const now = this.ctx.currentTime;
    if (this.fadingOut && now >= this.fadingOutUntil + 0.05) {
      this.fadingOut = null;
      this.fadingOutUntil = 0;
    }

    const cur = this.cur;
    if (!cur) return;

    // Promote the next slot once its start time has passed
    if (this.nxt && now >= this.nxt.startCtx) {
      this.cur = this.nxt; this.pos = this.nxtPos; this.nxt = null;
      this.pendingTrack = null;
      this.emit();
      return;
    }
    if (this.nxt || this.scheduling || this.ctx.state !== "running") return;

    const endCtx = cur.startCtx + (cur.buffer.duration - cur.offset);
    const D = this.crossfade / 2;
    if (now >= endCtx - D - LOOKAHEAD) {
      this.scheduling = true;
      this.scheduleNext(cur, endCtx).finally(() => (this.scheduling = false));
    }
  }

  private async scheduleNext(cur: Slot, endCtx: number) {
    const myGen = this.gen;
    const np = this.nextPos();
    if (np < 0) return;
    const track = this.queue[this.order[np]];
    const buffer = await this.load(track);
    if (myGen !== this.gen || this.cur !== cur) return;

    const D = this.fadeLen(endCtx - this.ctx.currentTime, buffer);
    // Transition start: last D seconds of current overlap first D seconds of next
    const T = Math.max(endCtx - D, this.ctx.currentTime + 0.01);

    if (D > 0) {
      const g = cur.gain.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(1, this.ctx.currentTime);
      g.setValueCurveAtTime(FADE_OUT, T, D);          // cos(t·π/2)
    }
    this.nxt = this.makeSlot(track, buffer, T, 0, { dur: D }); // sin(t·π/2)
    this.nxtPos = np;
  }

  private onEnded(slot: Slot) {
    // Fires when the final track finishes with nothing queued
    if (this.cur === slot && !this.nxt && this.nextPos() < 0) {
      this.playing = false; this.emit();
    }
  }

  dispose() { clearInterval(this.timer); this.ctx.close(); }
}

export const engine = new AudioEngine();
