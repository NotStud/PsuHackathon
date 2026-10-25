// Turns a raw shot recording into a shareable kill cam video: the same replay the app
// shows (run-up at normal speed, then slow motion from the shot) with the player's
// crosshair, hit-marker pop and flash burned in. Plays the clip onto a canvas and
// records the canvas, so it takes about as long as the replay itself (a few seconds).

// Match trigger_camera/killcam.js so the download looks like the in-app kill cam.
const LEAD_S = 2
const SLOW_RATE = 0.2
const MAX_SIDE = 720
const MIME_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

export const canRenderKillCam = () =>
  typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'

function once(target: EventTarget, event: string) {
  return new Promise<void>((resolve) => target.addEventListener(event, () => resolve(), { once: true }))
}

// Chrome's MediaRecorder writes WebM without a duration; seeking far past the end makes
// the browser work it out (same trick as killcam.js).
async function knownDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration)) return
  const found = once(video, 'durationchange')
  video.currentTime = 1e101
  while (!Number.isFinite(video.duration)) await found
}

async function seek(video: HTMLVideoElement, time: number) {
  const seeked = once(video, 'seeked')
  video.currentTime = time
  await seeked
}

function loadSvg(svg: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not draw the crosshair.'))
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

/** `crosshairSvg` is the crosshair's SVG markup (any size; it is scaled to the video). */
export async function renderKillCam(clip: Blob, shotAt: number, crosshairSvg: string): Promise<Blob> {
  const crosshair = await loadSvg(crosshairSvg)
  const url = URL.createObjectURL(clip)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  // iOS only decodes frames for videos that are in the page.
  video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  let raf = 0
  try {
    const loaded = once(video, 'loadedmetadata')
    video.src = url
    await loaded
    await knownDuration(video)
    const hitAt = Math.min(shotAt, video.duration)
    await seek(video, Math.max(0, hitAt - LEAD_S))

    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round((video.videoWidth * scale) / 2) * 2 // encoders want even sizes
    canvas.height = Math.round((video.videoHeight * scale) / 2) * 2
    const ctx = canvas.getContext('2d')!
    const { width: w, height: h } = canvas
    const size = Math.round(Math.min(w, h) * 0.18)

    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h)
      // Hit marker, in video time after the shot: the crosshair pops, the screen flashes.
      const since = video.currentTime - hitAt
      const pop = since >= 0 && since < 0.1 ? 1 + 1.2 * (1 - since / 0.1) : 1
      const s = size * pop
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)' // keeps the crosshair readable on any background
      ctx.shadowBlur = Math.max(2, size * 0.06)
      ctx.drawImage(crosshair, (w - s) / 2, (h - s) / 2, s, s)
      ctx.restore()
      if (since >= 0 && since < 0.08) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * (1 - since / 0.08)})`
        ctx.fillRect(0, 0, w, h)
      }
    }

    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const recorder = new MediaRecorder(canvas.captureStream(30), mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const stopped = once(recorder, 'stop')

    const tick = () => {
      // Slow motion from the shot to the end of the clip.
      const rate = video.currentTime >= hitAt ? SLOW_RATE : 1
      if (video.playbackRate !== rate) video.playbackRate = rate
      draw()
      raf = requestAnimationFrame(tick)
    }
    draw()
    recorder.start(250)
    tick()
    const ended = once(video, 'ended')
    await video.play()
    // Never hang: the replay is at most LEAD_S plus the post-roll in slow motion.
    await Promise.race([ended, new Promise((r) => setTimeout(r, 30_000))])
    cancelAnimationFrame(raf)
    draw()
    recorder.stop()
    await stopped
    return new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
  } finally {
    cancelAnimationFrame(raf)
    video.remove()
    URL.revokeObjectURL(url)
  }
}
