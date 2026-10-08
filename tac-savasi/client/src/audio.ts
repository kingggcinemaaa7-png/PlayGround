// Tiny WebAudio synth: no external files, original sounds only.
// Master/music/sfx gains, ducking under announcer, mute toggle, -16 LUFS-ish (conservative gains).
export class AudioBus {
  ctx: AudioContext | null = null;
  master!: GainNode; music!: GainNode; sfx!: GainNode; duckGain!: GainNode;
  muted = false;
  /** decoded sample files by logical name (music-calm, music-intense, sfx-meteor...) */
  files = new Map<string, AudioBuffer>();
  private playing = new Map<string, AudioBufferSourceNode>();
  private musicNodes: AudioBufferSourceNode[] = [];
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.6;
    this.analyser = this.ctx.createAnalyser();
    this.master.connect(this.analyser); this.analyser.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    this.sfx = this.ctx.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
    this.loop();
  }
  /** Load a real audio file; returns false so callers keep the synth fallback. */
  async load(name: string, url: string): Promise<boolean> {
    this.ensure();
    if (!this.ctx) return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      this.files.set(name, await this.ctx.decodeAudioData(buf));
      return true;
    } catch { return false; }
  }
  has(name: string) { return this.files.has(name); }

  /** Loop a real music track; `layer` lets calm+intense stack. */
  playMusic(name: string, layer = 1): boolean {
    this.ensure();
    const buf = this.files.get(name);
    if (!this.ctx || !buf || this.playing.has(name)) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = layer;
    src.connect(g); g.connect(this.music);
    src.start();
    this.playing.set(name, src);
    this.musicNodes.push(src);
    return true;
  }
  stopMusic(name: string) {
    const s = this.playing.get(name);
    if (!s) return;
    try { s.stop(); } catch { /* noop */ }
    this.playing.delete(name);
    this.musicNodes = this.musicNodes.filter((n) => n !== s);
  }
  stopAllMusic() { for (const n of [...this.playing.keys()]) this.stopMusic(n); }

  /** Play a one-shot sample if it exists (returns false otherwise). */
  playSample(name: string, vol = 0.6): boolean {
    this.ensure();
    const buf = this.files.get(name);
    if (!this.ctx || !buf || !this.sfx) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(this.sfx);
    src.start();
    return true;
  }

  setVolumes(master: number, music: number, sfx: number) {
    if (!this.ctx) return;
    this.master.gain.value = master; this.music.gain.value = music; this.sfx.gain.value = sfx;
  }
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.6;
    return this.muted;
  }
  duck(sec = 0.8) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(0.12, t + 0.1);
    this.music.gain.linearRampToValueAtTime(0.35, t + sec);
  }
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0, bus?: GainNode) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(bus ?? this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  private noise(dur: number, vol: number, delay = 0, low = 400) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t0);
  }
  shot() { this.tone(700 + Math.random() * 200, 0.08, 'square', 0.05, -300); }
  hit() { this.noise(0.06, 0.12, 0, 2000); }
  kill() { this.tone(220, 0.25, 'sawtooth', 0.16, -140); this.noise(0.2, 0.15, 0, 900); }
  streak(tier: number) { const base = tier >= 50 ? 880 : tier >= 30 ? 660 : tier >= 15 ? 520 : 440; [0, 0.09, 0.18].forEach((d, i) => this.tone(base * (1 + i * 0.25), 0.18, 'triangle', 0.2, 120, d)); }
  gift(tier: number) { this.tone(300 + tier * 120, 0.3, 'sine', 0.2, 300); if (tier >= 4) this.tone(900, 0.5, 'triangle', 0.18, 400, 0.15); }
  meteor() { this.noise(0.7, 0.3, 0, 500); this.tone(90, 0.7, 'sine', 0.3, -40); }
  thunder() { this.noise(0.9, 0.25, 0, 300); }
  roar() { this.tone(70, 0.8, 'sawtooth', 0.3, 60); }
  tick() { this.tone(1000, 0.06, 'square', 0.1); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.22, 0, i * 0.14)); }
  ui() { this.tone(600, 0.06, 'sine', 0.1); }
  private loop() {
    if (this.files.size) { this.syncMusicLayers(); return; }
    // adaptive calm->intense pad: schedule soft arpeggio; intensity set via setIntense()
    const step = () => {
      if (!this.ctx) return;
      const notes = this.intense ? [110, 130, 98, 146] : [220, 277, 330, 277];
      const n = notes[Math.floor(Math.random() * notes.length)];
      this.tone(n, 1.2, 'sine', this.intense ? 0.05 : 0.03, 0, 0, this.music);
      setTimeout(step, this.intense ? 420 : 900);
    };
    step();
  }

  /** Real tracks: calm always, intense only when the arena heats up. */
  syncMusicLayers() {
    if (this.intense) { this.playMusic('music-intense', 0.7); this.stopMusic('music-calm'); }
    else { this.playMusic('music-calm', 0.7); this.stopMusic('music-intense'); }
  }

  /**
   * Announcer voice line. Uses a real clip when the manifest provides one for
   * the active locale, otherwise a short synthesised "radio" cue (never silent).
   */
  say(locale: string, key: string, text: string) {
    const clip = `announcer-${locale}-${key}`;
    if (this.playSample(clip, 0.85)) return;
    // no recorded clip yet: play a short radio cue whose length hints at the
    // spoken line so pacing still reads correctly
    const words = Math.max(2, Math.min(10, text.split(/\s+/).length));
    this.duck(1.4);
    this.tone(660, 0.09, 'square', 0.05, -160);
    this.tone(880, 0.11, 'square', 0.04, -200, 0.1);
    this.tone(1180, 0.08 + words * 0.02, 'triangle', 0.03, -260, 0.22);
  }

  /** Rough integrated-loudness meter (dBFS proxy) for the -16 LUFS target. */
  measureLevel(): number {
    if (!this.analyser) this.analyser = this.ctx ? this.ctx.createAnalyser() : null;
    if (!this.analyser) return -100;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length) || 1e-9;
    return 20 * Math.log10(rms);
  }
  private analyser: AnalyserNode | null = null;

  intense = false;
}
export const audio = new AudioBus();
