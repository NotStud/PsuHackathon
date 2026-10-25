import { useEffect, useRef, useState } from 'react'
import { playKillCam } from '../../../trigger_camera/killcam.js'
import { CrosshairIcon } from '../components/Icons'
import type { Shot } from './CameraView'
import type { PersonCheck } from './personCheck'

const HIGHLIGHT_KEY = 'snipe:highlightPeople'

function loadHighlight() {
  try {
    return localStorage.getItem(HIGHLIGHT_KEY) !== 'off'
  } catch {
    return true
  }
}

function saveHighlight(on: boolean) {
  try {
    localStorage.setItem(HIGHLIGHT_KEY, on ? 'on' : 'off')
  } catch {
    // Storage unavailable (private mode etc.); just don't remember.
  }
}

/**
 * After a shot: the kill cam (auto-plays and loops, normal speed up to the shot,
 * then slow motion) beside the hit photo. Both are center-cropped like the live
 * view, so the crosshair sits where the shooter aimed. Once the person check is done,
 * the hit photo shows a HEADSHOT / HIT / MISS verdict, and detected people and heads highlighted (the
 * player can toggle the highlight; the choice is remembered on this device).
 */
export function ShotReview({ shot, check }: { shot: Shot; check: PersonCheck | 'checking' | 'failed' | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pop, setPop] = useState(0)
  const [highlight, setHighlight] = useState(loadHighlight)
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
          <video ref={videoRef} muted playsInline />
          {/* Re-keying restarts the hit-marker animation each loop. */}
          <div key={pop} className={pop ? 'shot-crosshair pop' : 'shot-crosshair'} aria-hidden>
            <CrosshairIcon width={56} height={56} strokeWidth={1.5} />
          </div>
          {pop > 0 && <div key={`flash${pop}`} className="snipe-flash" />}
          <span className="shot-label shot-label-live">KILL CAM</span>
        </div>
      )}
      <div className="shot-panel">
        <img src={result && highlight ? result.highlighted : shot.photo} alt="Your shot" />
        <div className="shot-crosshair" aria-hidden>
          <CrosshairIcon width={56} height={56} strokeWidth={1.5} />
        </div>
        <span className="shot-label">HIT PHOTO</span>
        {result && (
          <button className={highlight ? 'highlight-toggle on' : 'highlight-toggle'} aria-pressed={highlight}
            onClick={() => { setHighlight(!highlight); saveHighlight(!highlight) }}>
            Highlight {highlight ? 'on' : 'off'}
          </button>
        )}
        {check && (
          <span className={`shot-verdict ${!result ? '' : result.headshot ? 'headshot' : result.hit ? 'hit' : 'miss'}`} role="status">
            {check === 'checking' ? 'Checking…' : !result ? 'Not checked' : result.headshot ? 'HEADSHOT' : result.hit ? 'HIT' : 'MISS'}
          </span>
        )}
      </div>
    </div>
  )
}
