import { useEffect, useRef, useState } from 'react'
import { Crosshair } from '../components/Crosshair'
import { useCrosshair } from '../crosshairs'
import { gameAudio, shotSoundBuffer, useShotSound } from './feedback'
import { canRenderKillCam, renderKillCam } from './renderKillCam'

// Websites can't write to the Photos app directly. On iPhone the share sheet's "Save Video"
// puts it in the camera roll (a plain download lands in Files). On Android, downloaded videos
// go to the Download folder, which the Gallery and Google Photos apps show automatically.
const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isAndroid = /Android/i.test(navigator.userAgent)

// One render per shot, crosshair and gunshot sound, shared by every screen that offers the download.
const rendered = new WeakMap<Blob, Map<string, Promise<Blob>>>()

async function render(clip: Blob, shotAt: number, crosshairSvg: string, soundId: string) {
  const ctx = gameAudio()
  const sound = ctx ? await shotSoundBuffer(soundId).catch(() => null) : null
  return renderKillCam(clip, shotAt, crosshairSvg, ctx && sound ? { ctx, sound } : null)
}

function killCamVideo(clip: Blob, shotAt: number, crosshairSvg: string, soundId: string, key: string) {
  const byChoice = rendered.get(clip) ?? new Map<string, Promise<Blob>>()
  rendered.set(clip, byChoice)
  if (!byChoice.has(key)) {
    // If the browser can't render it, fall back to the plain recording.
    byChoice.set(key, render(clip, shotAt, crosshairSvg, soundId).catch(() => clip))
  }
  return byChoice.get(key)!
}

/**
 * Save the kill cam (crosshair, slow motion and gunshot sound included) to the phone's camera
 * roll (or download it on a computer), or send it through the share sheet. Rendering starts as
 * soon as this shows, because phones only open the share sheet straight after a tap.
 */
export function KillCamActions({ clip, shotAt }: { clip: Blob; shotAt: number }) {
  const [choice] = useCrosshair()
  const [sound] = useShotSound()
  const key = `${choice.style}:${choice.color}:${sound.shot}`
  const svgHolder = useRef<HTMLSpanElement>(null)
  const [result, setResult] = useState<{ key: string; clip: Blob; video: Blob } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canRenderKillCam()) return
    const svg = svgHolder.current?.innerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    if (!svg) return
    let cancelled = false
    void killCamVideo(clip, shotAt, svg, sound.shot, key).then((video) => !cancelled && setResult({ key, clip, video }))
    return () => {
      cancelled = true
    }
  }, [clip, shotAt, key, sound.shot])

  const video = !canRenderKillCam() ? clip : result?.key === key && result.clip === clip ? result.video : null

  function toFile(blob: Blob, name = 'snipe-killcam') {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    return new File([blob], `${name}.${ext}`, { type: blob.type || `video/${ext}` })
  }
  // Named when saved or shared, e.g. snipe-killcam-2026-10-25-14-03-07.mp4
  const stamped = (blob: Blob) =>
    toFile(blob, `snipe-killcam-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)

  const canShare =
    video !== null && typeof navigator.canShare === 'function' && navigator.canShare({ files: [toFile(video)] })

  function download() {
    if (!video) return
    const file = stamped(video)
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function share() {
    if (!video) return
    setError(null)
    try {
      await navigator.share({ files: [stamped(video)], title: 'Snipe kill cam' })
    } catch (err) {
      // Closing the share sheet isn't an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Sharing failed. Try Download instead.')
    }
  }

  // iPhone: the share sheet is the only way into Photos ("Save Video"); it also covers sharing.
  const saveViaShareSheet = isIOS && canShare

  return (
    <div className="killcam-actions">
      {/* The crosshair to burn into the video, in the player's chosen style and color. */}
      <span ref={svgHolder} hidden>
        <Crosshair size={256} />
      </span>
      <button
        type="button"
        className="button"
        disabled={!video}
        onClick={saveViaShareSheet ? () => void share() : download}
      >
        {!video ? 'Preparing kill cam…' : isIOS || isAndroid ? 'Save to camera roll' : 'Download kill cam'}
      </button>
      {canShare && !saveViaShareSheet && (
        <button type="button" className="button" onClick={() => void share()}>
          Share
        </button>
      )}
      {video && saveViaShareSheet && <p className="muted small killcam-hint">Tap “Save Video” to put it in Photos, or send it from the same menu.</p>}
      {video && isAndroid && <p className="muted small killcam-hint">Saves to your Gallery (Download album).</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
