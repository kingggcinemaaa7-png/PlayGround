// WebAudio synth müzik bus + SFX + TTS ducking (spec §9.7)
// Hiçbir harici ses dosyası gerekmez: kick/hat/bass/pad tamamen sentezlenir.
export class AudioBus {
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.playing = false;
    this.step = 0;
    this.timer = null;
    this.bpm = 122;
  }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.cfg.musicVolume ?? 0.5;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.cfg.sfxVolume ?? 0.7;
    this.sfxGain.connect(this.ctx.destination);
  }
  start() {
    this.ensure();
    if (this.playing) return;
    this.ctx.resume();
    this.playing = true;
    const stepMs = 60000 / this.bpm / 2; // 8'likler
    this.timer = setInterval(() => this.schedule(this.step++), stepMs);
  }
  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.musicGain) this.musicGain.gain.value = this.muted ? 0 : (this.cfg.musicVolume ?? 0.5);
    if (this.sfxGain) this.sfxGain.gain.value = this.muted ? 0 : (this.cfg.sfxVolume ?? 0.7);
    return this.muted;
  }
  tone(freq, t0, dur, type, vol, dest) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.musicGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(t0, dur, vol, hp = 6000) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t0);
  }
  schedule(s) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const bar = Math.floor(s / 8) % 4;
    // four-on-the-floor kick
    if (s % 2 === 0) this.tone(52, t, 0.22, 'sine', 0.9);
    // hat
    if (s % 2 === 1) this.noise(t, 0.05, 0.12);
    // bassline (la-minör vadi groove)
    const bassNotes = [55, 55, 65.4, 49];
    this.tone(bassNotes[bar] * 2, t, 0.24, 'sawtooth', 0.10);
    this.tone(bassNotes[bar], t, 0.24, 'triangle', 0.22);
    // pad her 2 bar
    if (s % 16 === 0) {
      [220, 261.6, 329.6].forEach((f) => this.tone(f, t, 1.6, 'sine', 0.05));
    }
  }
  sfx(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'gift_small') { this.tone(880, t, 0.12, 'sine', 0.25, this.sfxGain); this.tone(1320, t + 0.07, 0.15, 'sine', 0.2, this.sfxGain); }
    else if (kind === 'gift_medium') { [660, 880, 1100].forEach((f, i) => this.tone(f, t + i * 0.07, 0.16, 'triangle', 0.28, this.sfxGain)); }
    else if (kind === 'gift_large') { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.08, 0.2, 'triangle', 0.3, this.sfxGain)); this.noise(t, 0.3, 0.1, 3000); }
    else if (kind === 'gift_mega') { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, t + i * 0.09, 0.3, 'sawtooth', 0.16, this.sfxGain)); this.noise(t, 0.6, 0.16, 2000); }
    else if (kind === 'gift_legend') { [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, t + i * 0.1, 0.4, 'triangle', 0.3, this.sfxGain)); this.noise(t, 0.9, 0.2, 1500); }
    else if (kind === 'drop') { this.tone(110, t, 0.5, 'sawtooth', 0.4, this.sfxGain); this.noise(t, 0.5, 0.25, 800); [55, 82, 110].forEach((f) => this.tone(f, t + 0.1, 0.8, 'sine', 0.5, this.sfxGain)); }
  }
  // TTS ducking: konuşma öncesi müziği %30'a indir, sonra geri aç (spec §9.7)
  async duckSpeak(text) {
    this.ensure();
    if (!this.musicGain) return;
    const target = (this.cfg.musicVolume ?? 0.5) * (this.cfg.ttsDuckLevel ?? 0.3);
    const t = this.ctx.currentTime;
    const fade = (this.cfg.ttsDuckFadeMs ?? 300) / 1000;
    try {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
      this.musicGain.gain.linearRampToValueAtTime(this.muted ? 0 : target, t + fade);
    } catch { /* yoksay */ }
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'tr-TR'; u.rate = 1.05; u.pitch = 1.0;
        const done = new Promise((res) => { u.onend = res; u.onerror = res; setTimeout(res, 6000); });
        window.speechSynthesis.speak(u);
        await done;
      } else {
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      try {
        const t2 = this.ctx.currentTime;
        this.musicGain.gain.cancelScheduledValues(t2);
        this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t2);
        this.musicGain.gain.linearRampToValueAtTime(this.muted ? 0 : (this.cfg.musicVolume ?? 0.5), t2 + fade);
      } catch { /* yoksay */ }
    }
  }
}
