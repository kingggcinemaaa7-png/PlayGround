/**
 * Prosedürel Web Audio ses motoru — harici mp3/wav yok.
 * Tüm sesler osilatör, gürültü ve filtrelerle gerçek zamanlı sentezlenir.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null
    this.master = null
    this.sfx = null
    this.ambient = null
    this.volume = 0.65
    this.muted = false
    this.unlocked = false
    this.sirenNodes = null
    this._steamTimer = null
  }

  unlock() {
    if (this.unlocked && this.ctx?.state === 'running') return true
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return false
    if (!this.ctx) {
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : this.volume
      this.master.connect(this.ctx.destination)

      const compressor = this.ctx.createDynamicsCompressor()
      compressor.threshold.value = -16
      compressor.knee.value = 22
      compressor.ratio.value = 5
      compressor.attack.value = 0.004
      compressor.release.value = 0.22
      compressor.connect(this.master)

      this.sfx = this.ctx.createGain()
      this.sfx.gain.value = 0.9
      this.sfx.connect(compressor)

      this.ambient = this.ctx.createGain()
      this.ambient.gain.value = 0.34
      this.ambient.connect(compressor)
      this.startAmbience()
    }
    this.ctx.resume().catch(() => {})
    this.unlocked = true
    return true
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value)))
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05)
  }

  setMuted(muted) {
    this.muted = Boolean(muted)
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05)
  }

  now() {
    return this.ctx.currentTime
  }

  noiseBuffer(seconds = 1) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds))
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  startAmbience() {
    if (!this.ctx) return
    const ctx = this.ctx
    const buffer = this.noiseBuffer(2)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const lowpass = ctx.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 480
    lowpass.Q.value = 0.4
    const gain = ctx.createGain()
    gain.gain.value = 0.1
    src.connect(lowpass).connect(gain).connect(this.ambient)
    src.start()

    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 180
    lfo.connect(lfoGain).connect(lowpass.frequency)
    lfo.start()

    // Uzak mahalle uğultusu: alçak, yumuşak bir drone.
    const drone = ctx.createOscillator()
    drone.type = 'sine'
    drone.frequency.value = 58
    const droneGain = ctx.createGain()
    droneGain.gain.value = 0.022
    drone.connect(droneGain).connect(this.ambient)
    drone.start()
  }

  tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, at = 0, dest = null, glide = null, curve = 'exp' }) {
    if (!this.ctx) return
    const t = this.now() + at
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (glide != null) {
      if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, glide), t + dur)
      else osc.frequency.linearRampToValueAtTime(glide, t + dur)
    }
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(dest ?? this.sfx)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }

  noise({ dur = 0.2, gain = 0.2, type = 'bandpass', freq = 1200, q = 1, at = 0, dest = null, sweep = null }) {
    if (!this.ctx) return
    const t = this.now() + at
    const src = this.ctx.createBufferSource()
    src.buffer = this.noiseBuffer(dur + 0.05)
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(freq, t)
    filter.Q.value = q
    if (sweep != null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter).connect(g).connect(dest ?? this.sfx)
    src.start(t)
    src.stop(t + dur + 0.08)
  }

  /** İnce belli bardağa çay kaşığı: kristal çınlama + kısa metal tık. */
  playTeaSpoon(pan = 0, at = 0) {
    if (!this.unlock()) return
    const p = this.ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    p.connect(this.sfx)
    this.tone({ freq: 2100 + Math.random() * 700, type: 'sine', dur: 0.5, gain: 0.16, at, dest: p, glide: 1400 })
    this.tone({ freq: 3300 + Math.random() * 900, type: 'sine', dur: 0.28, gain: 0.07, at, dest: p })
    this.noise({ dur: 0.045, gain: 0.12, type: 'highpass', freq: 5200, at, dest: p })
  }

  /** Istakaya çarpan okey taşı: tok ahşap darbe + taş tıkırtısı. */
  playOkeySlam(pan = 0, at = 0) {
    if (!this.unlock()) return
    const p = this.ctx.createStereoPanner()
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan))
    p.connect(this.sfx)
    this.tone({ freq: 120, type: 'triangle', dur: 0.18, gain: 0.4, at, dest: p, glide: 52 })
    this.noise({ dur: 0.12, gain: 0.22, type: 'bandpass', freq: 1900, q: 0.8, at, dest: p })
    this.tone({ freq: 780, type: 'square', dur: 0.05, gain: 0.05, at, dest: p })
    this.noise({ dur: 0.25, gain: 0.05, type: 'highpass', freq: 4200, at: at + 0.08, dest: p })
  }

  playTeaPour(at = 0) {
    if (!this.unlock()) return
    this.noise({ dur: 0.55, gain: 0.1, type: 'bandpass', freq: 700, q: 2.2, at, sweep: 1600 })
    this.tone({ freq: 210, type: 'sine', dur: 0.2, gain: 0.06, at: at + 0.1 })
  }

  playTost() {
    if (!this.unlock()) return
    this.noise({ dur: 0.25, gain: 0.14, type: 'bandpass', freq: 2400, q: 1.4, sweep: 800 })
    this.tone({ freq: 160, type: 'sawtooth', dur: 0.12, gain: 0.06, glide: 90 })
  }

  /** Zabıta düdüğü + siren: iki tonlu, yükselen alçalan. */
  startSiren() {
    if (!this.unlock() || this.sirenNodes) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    osc.type = 'square'
    osc2.type = 'sawtooth'
    osc.frequency.value = 660
    osc2.frequency.value = 990
    filter.type = 'bandpass'
    filter.frequency.value = 1200
    filter.Q.value = 0.7
    gain.gain.value = 0.012
    const lfo = ctx.createOscillator()
    const lfoGain = ctx.createGain()
    lfo.frequency.value = 0.72
    lfoGain.gain.value = 240
    lfo.connect(lfoGain)
    lfoGain.connect(osc.frequency)
    lfoGain.connect(osc2.frequency)
    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(gain).connect(this.sfx)
    osc.start(t)
    osc2.start(t)
    lfo.start(t)
    this.sirenNodes = { osc, osc2, gain, lfo }
    // Düdük vuruşu
    this.tone({ freq: 1900, type: 'sine', dur: 0.3, gain: 0.1, glide: 2600 })
  }

  stopSiren() {
    if (!this.sirenNodes) return
    const { osc, osc2, gain, lfo } = this.sirenNodes
    const t = this.now()
    gain.gain.setTargetAtTime(0.0001, t, 0.08)
    try {
      osc.stop(t + 0.4)
      osc2.stop(t + 0.4)
      lfo.stop(t + 0.4)
    } catch {
      /* already stopped */
    }
    this.sirenNodes = null
  }

  /** Muhtar karşılama: davul vuruşları + zurna melodisi. */
  playMuhtarFanfare() {
    if (!this.unlock()) return
    const beat = 0.22
    const davul = (at, strong = 1) => {
      this.tone({ freq: 92, type: 'sine', dur: 0.24, gain: 0.32 * strong, at, glide: 46 })
      this.noise({ dur: 0.07, gain: 0.12 * strong, type: 'lowpass', freq: 900, at })
    }
    davul(0, 1.1)
    davul(beat, 0.6)
    davul(beat * 2, 0.8)
    davul(beat * 3, 0.55)
    davul(beat * 4, 1.2)
    davul(beat * 5, 0.6)
    davul(beat * 6, 0.8)
    davul(beat * 7, 0.5)

    const notes = [
      [0.0, 523.25, 0.16],
      [0.16, 659.25, 0.14],
      [0.32, 783.99, 0.2],
      [0.52, 659.25, 0.12],
      [0.66, 880.0, 0.24],
      [0.9, 783.99, 0.2],
      [1.1, 659.25, 0.16],
      [1.3, 587.33, 0.3],
      [1.6, 523.25, 0.4]
    ]
    for (const [at, freq, dur] of notes) {
      this.tone({ freq, type: 'sawtooth', dur, gain: 0.055, at, glide: freq * 0.995 })
      this.tone({ freq: freq * 2, type: 'triangle', dur: dur * 0.7, gain: 0.02, at })
    }
    // Zil / def
    this.noise({ dur: 1.4, gain: 0.05, type: 'highpass', freq: 6000, at: 0.9 })
    this.playApplause(1.7)
  }

  playApplause(at = 0) {
    if (!this.ctx) return
    for (let i = 0; i < 16; i++) {
      const t = at + Math.random() * 0.9
      this.noise({ dur: 0.06, gain: 0.028, type: 'highpass', freq: 1800 + Math.random() * 2400, at: t })
    }
  }

  playChatBlip() {
    if (!this.unlock()) return
    this.tone({ freq: 880, type: 'sine', dur: 0.07, gain: 0.05 })
    this.tone({ freq: 1320, type: 'sine', dur: 0.06, gain: 0.035, at: 0.045 })
  }

  playGiftChime(coins = 1) {
    if (!this.unlock()) return
    const base = coins >= 300 ? 392 : coins >= 100 ? 440 : coins >= 30 ? 523.25 : 659.25
    const seq = [1, 1.25, 1.5, 2]
    seq.forEach((mult, i) => {
      this.tone({ freq: base * mult, type: 'sine', dur: 0.5, gain: 0.1 - i * 0.015, at: i * 0.09 })
      this.tone({ freq: base * mult * 2.01, type: 'triangle', dur: 0.3, gain: 0.025, at: i * 0.09 })
    })
  }

  playStoveIgnite() {
    if (!this.unlock()) return
    this.noise({ dur: 0.7, gain: 0.16, type: 'bandpass', freq: 380, q: 0.7, sweep: 1600 })
    this.tone({ freq: 70, type: 'sawtooth', dur: 0.5, gain: 0.07, glide: 120 })
  }

  playWhoosh() {
    if (!this.unlock()) return
    this.noise({ dur: 0.6, gain: 0.14, type: 'bandpass', freq: 300, q: 0.6, sweep: 2400 })
  }

  playWin(kind = 'chat') {
    if (!this.unlock()) return
    const base = kind === 'chat' ? 523.25 : 392
    const notes = kind === 'chat' ? [1, 1.25, 1.5, 2] : [1, 0.75, 1.25, 1.5]
    notes.forEach((m, i) => {
      this.tone({ freq: base * m, type: 'triangle', dur: 0.7, gain: 0.12, at: i * 0.16 })
      this.tone({ freq: base * m * 0.5, type: 'sine', dur: 0.5, gain: 0.07, at: i * 0.16 })
    })
    this.playApplause(0.3)
  }

  playLose() {
    if (!this.unlock()) return
    ;[392, 370, 311, 262].forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.1, at: i * 0.2 })
    )
  }

  playHeartbeat() {
    if (!this.unlock()) return
    this.tone({ freq: 62, type: 'sine', dur: 0.18, gain: 0.24, glide: 40 })
    this.tone({ freq: 58, type: 'sine', dur: 0.2, gain: 0.2, at: 0.22, glide: 38 })
  }

  playCat() {
    if (!this.unlock()) return
    this.tone({ freq: 620, type: 'sine', dur: 0.24, gain: 0.03, glide: 900 })
  }
}

export const sound = new SoundEngine()
