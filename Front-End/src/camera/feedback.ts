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
function noise(ctx: AudioContext, seconds: number, env: (p: number) => number) {
  const len = Math.round(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * env(i / len)
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  return f
}

/** Volume node that fades from `peak` to silence over `seconds`, starting at `at`. */
function fade(ctx: AudioContext, peak: number, seconds: number, at = ctx.currentTime) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(peak, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + seconds)
  return g
}

/** A tone gliding from `from` Hz to `to` Hz. */
function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, seconds: number, at = ctx.currentTime) {
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

export const SHOT_SOUNDS: { id: string; name: string; play?: (ctx: AudioContext) => void }[] = [
  {
    id: 'classic', name: 'Classic', play: (ctx) => {
      play(noise(ctx, 0.25, (p) => (1 - p) ** 4), ctx.currentTime, 0.25, ctx.createGain())
    },
  },
  {
    id: 'sniper', name: 'Sniper', play: (ctx) => {
      const t = ctx.currentTime
      play(noise(ctx, 0.5, (p) => (1 - p) ** 3), t, 0.5, filter(ctx, 'lowpass', 2500), fade(ctx, 1, 0.5, t))
      play(tone(ctx, 'sine', 120, 40, 0.4, t), t, 0.4, fade(ctx, 0.9, 0.4, t))
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
  { id: 'off', name: 'Off' },
]

const soundPref = createPreference<{ shot: string }>('snipe:sound', (saved) => {
  const shot = (saved as { shot?: string } | null)?.shot
  return { shot: SHOT_SOUNDS.some((s) => s.id === shot) ? shot! : 'classic' }
})

/** The player's gunshot sound, saved on this device. "Off" silences every effect. */
export const useShotSound = soundPref.use

const soundOn = () => soundPref.get().shot !== 'off'

/** Play a gunshot sound (the player's choice unless `id` is given). */
export function playShot(id = soundPref.get().shot) {
  if (!audio) return
  SHOT_SOUNDS.find((s) => s.id === id)?.play?.(audio)
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
export function bang() {
  buzz()
  playShot()
}
