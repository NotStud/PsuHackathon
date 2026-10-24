import { useEffect, useRef, useState } from 'react'
import { playKillCam } from '../../../trigger_camera/killcam.js'
import { Crosshair } from '../components/Crosshair'
import type { Shot } from './CameraView'

/**
 * After a shot: the kill cam (auto-plays and loops, normal speed up to the shot,
 * then slow motion) beside the hit photo. Both are center-cropped like the live
 * view, so the crosshair sits where the shooter aimed.
 */
export function ShotReview({ shot }: { shot: Shot }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pop, setPop] = useState(0)

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
            <Crosshair size={56} />
          </div>
          {pop > 0 && <div key={`flash${pop}`} className="snipe-flash" />}
          <span className="shot-label shot-label-live">KILL CAM</span>
        </div>
      )}
      <div className="shot-panel">
        <img src={shot.photo} alt="Your shot" />
        <div className="shot-crosshair" aria-hidden>
          <Crosshair size={56} />
        </div>
        <span className="shot-label">HIT PHOTO</span>
      </div>
    </div>
  )
}
