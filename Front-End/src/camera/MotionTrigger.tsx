import { useEffect, useRef, useState } from 'react'
import { DEFAULT_THRESHOLD, FlickTrigger, type FireInfo } from '../../../trigger_camera/trigger.js'
import { unlockAudio } from './feedback'

/**
 * Flick-only trigger. One Start tap is needed because iOS only grants motion access
 * (and sound) from a tap; after that, a flick of the phone is the only way to shoot.
 */
export function MotionTrigger({ started, onStart, armed, onFire }: {
  started: boolean
  onStart: () => void
  armed: boolean
  onFire: (info: FireInfo) => void
}) {
  const triggerRef = useRef<FlickTrigger | null>(null)
  const fireRef = useRef(onFire)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [strength, setStrength] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sensor, setSensor] = useState(false)
  useEffect(() => { fireRef.current = onFire }, [onFire])

  useEffect(() => {
    const trigger = new FlickTrigger({
      onFire: (info) => fireRef.current(info),
      onSample: ({ strength }) => { setStrength(strength); setSensor(true) },
    })
    triggerRef.current = trigger
    return () => { trigger.disarm(); trigger.destroy(); triggerRef.current = null }
  }, [])

  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    trigger.threshold = threshold
    if (started && armed) trigger.arm()
    else trigger.disarm()
  }, [started, armed, threshold])

  async function start() {
    setError(null)
    try {
      // Both must be kicked off inside the tap, before any await, for iOS.
      const permission = FlickTrigger.requestPermission()
      unlockAudio()
      if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') {
        throw new Error('Motion needs HTTPS and a phone with a motion sensor.')
      }
      await permission
      onStart()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enable motion.')
    }
  }

  if (!started) {
    return (
      <div className="motion-trigger">
        <button className="button button-primary button-block" disabled={!armed} onClick={() => void start()}>
          Start
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    )
  }

  const full = strength >= threshold
  return (
    <div className="motion-trigger">
      <p role="status">{!sensor ? 'Waiting for motion sensor… Allow Motion & Orientation.' : armed ? 'Flick the phone up or down to shoot' : 'Trigger paused'}</p>
      <label>Sensitivity: {threshold}°/s
        <input aria-label="Flick threshold" type="range" min={20} max={360} value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))} />
      </label>
      {/* Shows the exact value the trigger checks, so a full red bar always fires. */}
      <div className="flick-meter" aria-label="Flick strength">
        <div className={full ? 'hot' : undefined} style={{ width: `${Math.min(100, strength / threshold * 100)}%` }} />
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
