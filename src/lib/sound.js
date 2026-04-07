// Singleton sound engine — import { sound } anywhere

class SoundEngine {
  constructor() {
    this._ctx     = null
    this.enabled  = localStorage.getItem('sound_enabled') !== 'false'
    this.volume   = parseFloat(localStorage.getItem('sound_volume') ?? '0.7')
  }

  // Lazily create AudioContext on first user gesture
  _ctx_get() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (this._ctx.state === 'suspended') this._ctx.resume()
    return this._ctx
  }

  _tone(freq, dur, type = 'sine', vol = null) {
    if (!this.enabled) return
    try {
      const ctx  = this._ctx_get()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = type
      osc.frequency.value = freq
      const v = (vol ?? this.volume) * 0.35
      gain.gain.setValueAtTime(v, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + dur)
    } catch { /* AudioContext blocked — ignore */ }
  }

  // ── Named sounds ────────────────────────────────────────────

  // Harsh alarm — task due NOW
  alarm() {
    this._tone(880, 0.8, 'square')
    setTimeout(() => this._tone(880, 0.8, 'square'), 900)
    setTimeout(() => this._tone(880, 0.8, 'square'), 1800)
  }

  // Double beep — 5 min warning
  warning() {
    this._tone(660, 0.25)
    setTimeout(() => this._tone(660, 0.25), 350)
  }

  // Ascending chime — timer complete / task done
  success() {
    ;[523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this._tone(f, 0.35, 'sine'), i * 130)
    )
  }

  // Low sawtooth — penalty issued
  penalty() {
    this._tone(180, 1.8, 'sawtooth', 0.5)
  }

  // Soft ping — AI message / nudge
  nudge() {
    this._tone(440, 0.18)
  }

  // Short tick — body double check-in
  tick() {
    this._tone(600, 0.08, 'sine', 0.3)
  }

  // ── Settings ────────────────────────────────────────────────

  setEnabled(val) {
    this.enabled = val
    localStorage.setItem('sound_enabled', String(val))
  }

  setVolume(val) {
    this.volume = val
    localStorage.setItem('sound_volume', String(val))
  }
}

export const sound = new SoundEngine()
