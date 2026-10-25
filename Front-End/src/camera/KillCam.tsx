import { useEffect, useRef, useState } from 'react'
import { playKillCam } from '../../../trigger_camera/killcam.js'
import { Crosshair } from '../components/Crosshair'
import type { Shot } from './CameraView'
import type { PersonCheck } from './personCheck'

/**
 * After a shot: the kill cam (auto-plays and loops, normal speed up to the shot,
 * then slow motion) beside the hit photo. Both are center-cropped like the live
 * view, so the crosshair sits where the shooter aimed. Once the person check is done,
 * the hit photo shows a HEADSHOT / HIT / MISS verdict in its top-right corner, and a
 * button to highlight the detected people and heads (off at the start of every shot).
 */
export function ShotReview({ shot, check, look }: {
  shot: Shot
  check: PersonCheck | 'checking' | 'failed' | null
  /** Overrides the player's crosshair (last place's forced look). */
  look?: { style: string; color: string }
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pop, setPop] = useState(0)
  const [highlight, setHighlight] = useState(false)
  const result = typeof check === 'object' && check ? check : null

  useEffect(() => {
    const video = videoRef.current
    if (!video || !shot.clip) return
    return playKillCam(video, shot.clip, shot.shotAt, { onShot: () => setPop((n) => n + 1) })
  }, [shot])

  return (
    <div className="shot-review">
      {shot.clip && (
        <div className="shot-panel">
          {/* The clip isn't cropped to a digital zoom, so scale it to match the photo. */}
          <video ref={videoRef} muted playsInline
            style={shot.zoom > 1 ? { transform: `scale(${shot.zoom})` } : undefined} />
          {/* Re-keying restarts the hit-marker animation each loop. */}
          <div key={pop} className={pop ? 'shot-crosshair pop' : 'shot-crosshair'} aria-hidden>
            <Crosshair size={56} style={look?.style} color={look?.color} />
          </div>
          {pop > 0 && <div key={`flash${pop}`} className="snipe-flash" />}
          <span className="shot-label shot-label-live">KILL CAM</span>
        </div>
      )}
      <div className="shot-panel">
        <img src={result && highlight ? result.highlighted : shot.photo} alt="Your shot" />
        <div className="shot-crosshair" aria-hidden>
          <Crosshair size={56} style={look?.style} color={look?.color} />
        </div>
        {/* Label and toggle share one row, so they can't overlap. Green = on, red = off. */}
        <div className="shot-footer">
          <span className="shot-label">HIT PHOTO</span>
          {result && (
            <button className={highlight ? 'highlight-toggle on' : 'highlight-toggle'} aria-pressed={highlight}
              aria-label="Highlight people" onClick={() => setHighlight(!highlight)}>
              Highlight
            </button>
          )}
        </div>
        {check && (
          <span className={`shot-verdict ${!result ? '' : result.headshot ? 'headshot' : result.hit ? 'hit' : 'miss'}`} role="status">
            {check === 'checking' ? 'Checking…' : !result ? 'Not checked' : result.headshot ? 'HEADSHOT' : result.hit ? 'HIT' : 'MISS'}
          </span>
        )}
      </div>
    </div>
  )
}
