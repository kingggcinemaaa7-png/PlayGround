/* Prosedürel Web Audio motoru — harici ses dosyası kullanmaz. */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.muted = false;
    this.volume = 0.7;
    this.marchTimer = null;
    this.intensity = 18;
    this.step = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;

    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.4);
    const wet = this.ctx.createGain();
    wet.gain.value = 0.22;

    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);
    this.master.connect(this.reverb);
    this.reverb.connect(wet);
    wet.connect(this.ctx.destination);

    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    }
  }

  mute(flag) {
    this.muted = !!flag;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.04);
    }
  }

  /* ---- yardımcılar ---- */
  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  osc({ freq = 220, end = null, dur = 0.3, type = 'sine', gain = 0.15, attack = 0.005, pan = 0, reverb = 0 }) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const p = this.ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (end) o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g);
    g.connect(p);
    p.connect(this.master);
    if (reverb > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverb;
      g.connect(send);
      send.connect(this.reverb);
    }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.25, gain = 0.12, type = 'highpass', freq = 1200, end = null, pan = 0, q = 1 }) {
    if (!this.ctx || this.muted) return;
    const t = this.now();
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - (i / length) * 0.65);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (end) filter.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(filter);
    filter.connect(g);
    g.connect(p);
    p.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---- sürekli yürüyüş ritmi ---- */
  marching(count = this.intensity) {
    this.intensity = Math.max(1, Number(count) || 1);
    if (!this.ctx) this.init();
    if (!this.ctx || this.marchTimer) return;
    this.marchTimer = setInterval(() => {
      if (this.muted) return;
      this.step++;
      const power = Math.min(1, 0.35 + this.intensity / 180);
      const pan = this.step % 2 ? -0.18 : 0.18;
      this.osc({ freq: 78, end: 44, dur: 0.17, type: 'sine', gain: 0.055 * power, pan });
      this.noise({ dur: 0.06, gain: 0.018 * power, type: 'highpass', freq: 3400, pan: -pan });
      if (this.step % 8 === 0) {
        this.osc({ freq: 116, end: 52, dur: 0.32, type: 'triangle', gain: 0.035 * power, pan });
      }
    }, 340);
  }

  stopMarching() {
    clearInterval(this.marchTimer);
    this.marchTimer = null;
  }

  /* ---- aksiyon sesleri ---- */
  playJoin() {
    this.init();
    this.osc({ freq: 392, end: 523, dur: 0.22, type: 'triangle', gain: 0.09 });
    this.osc({ freq: 523, end: 659, dur: 0.28, type: 'sine', gain: 0.06, reverb: 0.2 });
  }

  playRank() {
    this.init();
    [392, 494, 587].forEach((f, i) => {
      setTimeout(() => this.osc({ freq: f, dur: 0.34, type: 'sawtooth', gain: 0.07, reverb: 0.25 }), i * 70);
    });
    this.noise({ dur: 0.3, gain: 0.05, type: 'highpass', freq: 2800 });
  }

  playMehterDrum() {
    this.init();
    for (let i = 0; i < 7; i++) {
      setTimeout(() => {
        this.osc({ freq: 112, end: 38, dur: 0.5, type: 'triangle', gain: 0.26, reverb: 0.12 });
        this.noise({ dur: 0.16, gain: 0.17, type: 'highpass', freq: 3600 });
        this.osc({ freq: 880, end: 1320, dur: 0.18, type: 'square', gain: 0.028, pan: i % 2 ? 0.4 : -0.4 });
      }, i * 390);
    }
  }

  playCatapultFire() {
    this.init();
    this.noise({ dur: 0.62, gain: 0.11, type: 'bandpass', freq: 620, end: 220, q: 2 });
    this.osc({ freq: 150, end: 48, dur: 0.8, type: 'sawtooth', gain: 0.14 });
    setTimeout(() => {
      this.osc({ freq: 54, end: 26, dur: 1.1, type: 'sine', gain: 0.4, reverb: 0.2 });
      this.noise({ dur: 0.85, gain: 0.28, type: 'lowpass', freq: 520, end: 90 });
    }, 700);
  }

  playHorseNeigh() {
    this.init();
    const t = this.now();
    for (let i = 0; i < 5; i++) {
      this.osc({ freq: 260 + i * 90, end: 620 - i * 40, dur: 0.22, type: 'sawtooth', gain: 0.055, pan: -0.15 });
    }
    setTimeout(() => {
      this.osc({ freq: 180, end: 520, dur: 0.9, type: 'sawtooth', gain: 0.075, reverb: 0.15 });
    }, 120);
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.noise({ dur: 0.06, gain: 0.075, type: 'lowpass', freq: 320 });
        this.osc({ freq: 92, end: 60, dur: 0.09, type: 'sine', gain: 0.07 });
      }, 420 + i * 165);
    }
  }

  playGrandSeal() {
    this.init();
    this.osc({ freq: 48, end: 30, dur: 1.5, type: 'sine', gain: 0.42, reverb: 0.4 });
    this.noise({ dur: 0.6, gain: 0.16, type: 'bandpass', freq: 2100, end: 400 });
    setTimeout(() => {
      this.osc({ freq: 932, end: 186, dur: 1.2, type: 'triangle', gain: 0.07, reverb: 0.6 });
      this.osc({ freq: 1318, end: 220, dur: 0.9, type: 'sine', gain: 0.05, reverb: 0.6 });
    }, 90);
  }

  playVizierFanfare() {
    this.init();
    const melody = [196, 233, 261, 311, 392, 466, 523];
    melody.forEach((f, i) => {
      setTimeout(() => {
        this.osc({ freq: f, dur: 0.7, type: 'sawtooth', gain: 0.09, reverb: 0.3 });
        this.osc({ freq: f * 1.5, dur: 0.6, type: 'triangle', gain: 0.045, reverb: 0.3 });
      }, i * 135);
    });
    setTimeout(() => {
      this.osc({ freq: 98, end: 49, dur: 0.9, type: 'sine', gain: 0.3, reverb: 0.2 });
      this.noise({ dur: 0.7, gain: 0.1, type: 'highpass', freq: 3000 });
    }, 980);
  }

  playCrowd() {
    this.init();
    this.noise({ dur: 1.4, gain: 0.045, type: 'bandpass', freq: 900, q: 0.6 });
    this.noise({ dur: 1.1, gain: 0.03, type: 'bandpass', freq: 1600, q: 0.8 });
  }
}
