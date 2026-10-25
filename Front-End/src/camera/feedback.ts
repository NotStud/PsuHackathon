// Shot feedback: synthesized sound effects (no audio files) and a recoil buzz.
// The bang was ported from trigger_camera/index.html.
import { createPreference } from '../preferences'

let audio: AudioContext | null = null

/** iOS only allows sound that was set up inside a tap, so call this from one. */
export function unlockAudio() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!audio && Ctx) audio = new Ctx()
  void audio?.resume()
}

// ---------- Building blocks ----------

/** White noise shaped by an envelope: env(0..1 through the sound) -> gain. */
function noise(ctx: BaseAudioContext, seconds: number, env: (p: number) => number) {
  const len = Math.round(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * env(i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  return f
}

/** Volume node that fades from `peak` to silence over `seconds`, starting at `at`. */
function fade(ctx: BaseAudioContext, peak: number, seconds: number, at = ctx.currentTime) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + seconds)
  return g
}

/** A tone gliding from `from` Hz to `to` Hz. */
function tone(ctx: BaseAudioContext, type: OscillatorType, from: number, to: number, seconds: number, at = ctx.currentTime) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + seconds)
  return osc
}

function play(src: AudioScheduledSourceNode, at: number, seconds: number, ...chain: AudioNode[]) {
  ;[src, ...chain].reduce((a, b) => a.connect(b))
  chain.at(-1)!.connect(src.context.destination)
  src.start(at)
  src.stop(at + seconds)
}

// ---------- Gunshots ----------

let roomIR: AudioBuffer | null = null

/** Reverb for a mid-size room: a few early reflections, then a decaying noise tail. */
function room(ctx: BaseAudioContext) {
  if (!roomIR || roomIR.sampleRate !== ctx.sampleRate) {
    const rate = ctx.sampleRate
    const len = Math.round(rate * 1.3)
    roomIR = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = roomIR.getChannelData(ch)
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4 * 0.5
      // Walls and ceiling, slightly different per ear so it sounds wide.
      for (const [ms, gain] of [[11, 0.8], [19, 0.55], [31, 0.4], [47, 0.3]]) {
        data[Math.round(rate * (ms + ch * 1.7) / 1000)] += gain
      }
    }
  }
  const verb = ctx.createConvolver()
  verb.buffer = roomIR
  return verb
}

/**
 * Layered like a real recording: supersonic crack, muzzle blast whose brightness
 * drops fast, low-end thump, slide click, then the room answering back.
 */
function realisticShot(ctx: BaseAudioContext) {
  const t = ctx.currentTime

  // Master: compressor for punch, then overall level.
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 8
  comp.attack.value = 0.001
  comp.release.value = 0.2
  const master = ctx.createGain()
  master.gain.value = 2.8  // make-up gain after compression; peaks around 0.8
  comp.connect(master).connect(ctx.destination)

  // Dry layers go through gentle saturation, and also into the room.
  const shaper = ctx.createWaveShaper()
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(3 * (i / 511.5 - 1)))
  const verb = room(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.32
  shaper.connect(comp)
  shaper.connect(verb).connect(wet).connect(comp)

  // 1. Crack: a few milliseconds of bright noise.
  const crack = noise(ctx, 0.006, (p) => 1 - p)
  crack.connect(filter(ctx, 'highpass', 1800)).connect(fade(ctx, 1, 0.006, t)).connect(shaper)
  crack.start(t)

  // 2. Blast: instant attack, fast decay, low-pass sweeping down from very bright.
  const blast = noise(ctx, 0.4, (p) => Math.exp(-p * 12))
  const sweep = filter(ctx, 'lowpass', 9000)
  sweep.frequency.setValueAtTime(9000, t)
  sweep.frequency.exponentialRampToValueAtTime(450, t + 0.3)
  blast.connect(sweep).connect(fade(ctx, 0.9, 0.4, t)).connect(shaper)
  blast.start(t)

  // 3. Thump: the low "boom" you feel.
  const thump = tone(ctx, 'sine', 150, 42, 0.2, t)
  thump.connect(fade(ctx, 1, 0.22, t)).connect(shaper)
  thump.start(t)
  thump.stop(t + 0.22)

  // 4. Slide cycling, just after the shot; dry so it stays crisp.
  const slide = noise(ctx, 0.014, (p) => 1 - p)
  slide.connect(filter(ctx, 'bandpass', 3200)).connect(fade(ctx, 0.12, 0.014, t + 0.07)).connect(comp)
  slide.start(t + 0.07)
}

/** `hidden` sounds can't be picked; the game assigns them (last place gets "fart"). */
export const SHOT_SOUNDS: { id: string; name: string; play?: (ctx: BaseAudioContext) => void; hidden?: boolean }[] = [
  { id: 'realistic', name: 'Realistic', play: realisticShot },
  {
    id: 'classic', name: 'Classic', play: (ctx) => {
      play(noise(ctx, 0.25, (p) => (1 - p) ** 4), ctx.currentTime, 0.25, ctx.createGain())
    },
  },
  {
    id: 'sniper', name: 'Sniper', play: (ctx) => {
      const t = ctx.currentTime
      // Layer levels keep the combined peak under 1.0, so it doesn't clip.
      play(noise(ctx, 0.5, (p) => (1 - p) ** 3), t, 0.5, filter(ctx, 'lowpass', 2500), fade(ctx, 0.6, 0.5, t))
      play(tone(ctx, 'sine', 120, 40, 0.4, t), t, 0.4, fade(ctx, 0.5, 0.4, t))
      // Echo off a far wall.
      play(noise(ctx, 0.6, (p) => (1 - p) ** 2), t + 0.28, 0.6, filter(ctx, 'lowpass', 900), fade(ctx, 0.25, 0.6, t + 0.28))
    },
  },
  {
    id: 'laser', name: 'Laser', play: (ctx) => {
      const t = ctx.currentTime
      play(tone(ctx, 'sawtooth', 1800, 110, 0.28, t), t, 0.28, filter(ctx, 'lowpass', 4000), fade(ctx, 0.35, 0.28, t))
      play(tone(ctx, 'square', 900, 60, 0.28, t), t, 0.28, fade(ctx, 0.12, 0.28, t))
    },
  },
  {
    id: 'silenced', name: 'Silenced', play: (ctx) => {
      const t = ctx.currentTime
      play(noise(ctx, 0.12, (p) => (1 - p) ** 2), t, 0.12, filter(ctx, 'bandpass', 900), fade(ctx, 0.9, 0.12, t))
      play(tone(ctx, 'sine', 180, 70, 0.08, t), t, 0.08, fade(ctx, 0.4, 0.08, t))
    },
  },
  {
    id: 'retro', name: 'Retro', play: (ctx) => {
      const t = ctx.currentTime
      // Stepped pitch drop, like an old console's sound chip.
      const osc = ctx.createOscillator()
      osc.type = 'square'
      ;[880, 660, 440, 330, 220, 110].forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.03))
      play(osc, t, 0.22, fade(ctx, 0.25, 0.22, t))
      play(noise(ctx, 0.1, (p) => 1 - p), t, 0.1, filter(ctx, 'highpass', 2000), fade(ctx, 0.2, 0.1, t))
    },
  },
  {
    // Last place's gun: a squeaky, silly fart, the embarrassing kind. Modeled like a
    // voice synthesizer models speech: air through a tight flapping opening gives a
    // train of pinched pulses, thin high resonances shape them, breathy air rides on
    // each flap. The pitch whines up then down with a wobbly vibrato, and it ends in
    // a tiny "pft" as it runs out of air. Randomized every time.
    id: 'fart', name: 'Fart', hidden: true, play: (ctx) => {
      const rate = ctx.sampleRate
      const squeak = 0.5 + Math.random() * 0.25   // the squeal, in seconds
      const pft = 0.12                            // the little "pft" at the end
      const len = squeak + pft
      const n = Math.round(rate * len)
      const source = new Float32Array(n)
      const air = new Float32Array(n)
      const base = 260 + Math.random() * 80

      for (let i = 0; i < n;) {
        const t = i / rate
        let pitch: number, amp: number
        if (t < squeak) {
          // Whine up, then sag down, with a fast wobble.
          const p = t / squeak
          const contour = 1 + 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.3)) - 0.25 * p
          pitch = base * contour * (1 + 0.08 * Math.sin(2 * Math.PI * 8 * t))
          amp = Math.min(1, t / 0.02) * (1 - 0.5 * p) * (0.85 + Math.random() * 0.3)
        } else {
          // The "pft": a few low, breathy flaps.
          const p = (t - squeak) / pft
          pitch = 70 - 30 * p
          amp = 0.7 * (1 - p)
        }
        const period = Math.round((rate / pitch) * (0.96 + Math.random() * 0.08))
        const open = Math.round(period * 0.4), shut = Math.round(period * 0.08)
        for (let k = 0; k < period && i + k < n; k++) {
          let flow = 0
          if (k < open) flow = 0.5 * (1 - Math.cos(Math.PI * k / open))
          else if (k < open + shut) flow = Math.cos((Math.PI / 2) * (k - open) / shut)
          source[i + k] = flow * amp
          air[i + k] = (Math.random() * 2 - 1) * flow * amp * (t < squeak ? 0.5 : 1.5)
        }
        i += period
      }

      // Radiation brightens it; thin, high resonances make it squeaky rather than boomy.
      const out = new Float32Array(n)
      const resonate = (x: Float32Array, freq: number, bw: number, gain: number) => {
        const r = Math.exp(-Math.PI * bw / rate), a1 = 2 * r * Math.cos(2 * Math.PI * freq / rate), a2 = -r * r
        let y1 = 0, y2 = 0
        for (let i = 0; i < n; i++) {
          const y = (1 - r) * x[i] + a1 * y1 + a2 * y2
          y2 = y1
          y1 = y
          out[i] += y * gain
        }
      }
      const buzz = source.map((v, i) => v - (i ? source[i - 1] : 0))
      resonate(buzz, 650 + Math.random() * 100, 140, 1)
      resonate(buzz, 1400 + Math.random() * 200, 220, 0.5)
      resonate(buzz, 2800, 400, 0.15)
      resonate(air, 500, 700, 0.4)

      const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1
      for (let i = 0; i < n; i++) out[i] = (Math.tanh((out[i] / peak) * 1.6) / Math.tanh(1.6)) * 0.6

      const buf = ctx.createBuffer(1, n, rate)
      buf.getChannelData(0).set(out)
      const src = ctx.createBufferSource()
      src.buffer = buf
      play(src, ctx.currentTime, len, filter(ctx, 'lowpass', 5000))
    },
  },
  { id: 'off', name: 'Off' },
]

const soundPref = createPreference<{ shot: string }>('snipe:sound', (saved) => {
  const shot = (saved as { shot?: string } | null)?.shot
  return { shot: SHOT_SOUNDS.some((s) => s.id === shot && !s.hidden) ? shot! : 'realistic' }
})

/** The player's gunshot sound, saved on this device. "Off" silences every effect. */
export const useShotSound = soundPref.use

const soundOn = () => soundPref.get().shot !== 'off'

/** Play a gunshot sound (the player's choice unless `id` is given). */
export function playShot(id = soundPref.get().shot) {
  if (!audio) return
  SHOT_SOUNDS.find((s) => s.id === id)?.play?.(audio)
}

/** The game's audio context once a tap has unlocked it (see unlockAudio), else null. */
export const gameAudio = () => audio

/**
 * A gunshot rendered to a buffer instead of the speakers, for mixing into a recording
 * (the downloaded kill cam). Null when the sound is Off.
 */
export function shotSoundBuffer(id = soundPref.get().shot): Promise<AudioBuffer | null> {
  const sound = SHOT_SOUNDS.find((s) => s.id === id)?.play
  if (!sound) return Promise.resolve(null)
  const rate = 48_000
  const offline = new OfflineAudioContext(2, rate * 2, rate)  // 2 s covers the longest tail
  sound(offline)
  return offline.startRendering()
}

// ---------- Game sounds ----------

/** "Chk-chk" of a weapon being readied, when the trigger arms. */
export function playReload() {
  if (!audio || !soundOn()) return
  const t = audio.currentTime
  for (const [at, freq] of [[0, 3000], [0.11, 2200]] as const) {
    play(noise(audio, 0.03, (p) => 1 - p), t + at, 0.03, filter(audio, 'bandpass', freq), fade(audio, 0.8, 0.03, t + at))
  }
}

/** Hit-marker ding when a snipe lands. */
export function playHit() {
  if (!audio || !soundOn()) return
  const t = audio.currentTime
  play(tone(audio, 'sine', 1320, 1300, 0.35, t), t, 0.35, fade(audio, 0.3, 0.35, t))
  play(tone(audio, 'sine', 1980, 1960, 0.25, t + 0.06), t + 0.06, 0.25, fade(audio, 0.18, 0.25, t + 0.06))
}

// ---------- Haptics ----------

// Android supports the vibrate API. iOS Safari doesn't, but toggling a native
// switch control gives a haptic tap (iOS 18+), so we toggle a hidden one.
function buzz() {
  if (navigator.vibrate) {
    navigator.vibrate([70, 40, 40])  // kick + smaller echo, like recoil
    return
  }
  const label = document.createElement('label')
  label.style.display = 'none'
  label.innerHTML = '<input type="checkbox" switch>'
  document.body.appendChild(label)
  label.click()
  label.remove()
}

/** Everything that happens the instant a shot fires. */
export function bang(forcedSound?: string) {
  buzz()
  // A forced sound (last place's fart) replaces the player's choice, but Off still mutes.
  playShot(forcedSound && soundOn() ? forcedSound : undefined)
}
