// Shot feedback: a noise-burst "bang" and a recoil buzz.
// Ported from trigger_camera/index.html.

let audio: AudioContext | null = null

/** iOS only allows sound that was set up inside a tap, so call this from one. */
export function unlockAudio() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!audio && Ctx) audio = new Ctx()
  void audio?.resume()
}

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

export function bang() {
  buzz()
  if (!audio) return
  // Short burst of decaying noise.
  const len = audio.sampleRate * 0.25
  const buf = audio.createBuffer(1, len, audio.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4)
  const src = audio.createBufferSource()
  src.buffer = buf
  src.connect(audio.destination)
  src.start()
}
