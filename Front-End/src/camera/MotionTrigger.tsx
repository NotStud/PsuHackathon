import { useEffect, useRef, useState } from 'react'
import { DEFAULT_THRESHOLD, FlickTrigger } from '../../../trigger_camera/trigger.js'

/** Motion permission must be requested by a tap, especially on iOS. */
export function MotionTrigger({ armed, onFire }: {
  armed: boolean
  onFire: (steadyAt: number) => void
}) {
  const triggerRef = useRef<FlickTrigger | null>(null)
  const fireRef = useRef(onFire)
  const [enabled, setEnabled] = useState(false)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [strength, setStrength] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [sensor, setSensor] = useState(false)
  useEffect(() => { fireRef.current = onFire }, [onFire])

  useEffect(() => {
    const trigger = new FlickTrigger({
      onFire: ({ steadyAt }) => fireRef.current(steadyAt),
      onSample: ({ strength }) => { setStrength(strength); setSensor(true) },
    })
    triggerRef.current = trigger
    return () => { trigger.disarm(); trigger.destroy(); triggerRef.current = null }
  }, [])

  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    trigger.threshold = threshold
    if (enabled && armed) trigger.arm()
    else trigger.disarm()
  }, [enabled, armed, threshold])

  async function enable() {
    setError(null)
    try {
      if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') {
        throw new Error('Motion needs HTTPS and a phone with a motion sensor.')
      }
      await FlickTrigger.requestPermission()
      setEnabled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enable motion.')
    }
  }

  return (
    <div className="motion-trigger">
      <button className="button" onClick={() => enabled ? setEnabled(false) : void enable()}>
        {enabled ? 'Disable flick trigger' : 'Enable flick trigger'}
      </button>
      {enabled && <>
        <p role="status">{!sensor ? 'Waiting for motion sensor… You can also tap the shutter.' : armed ? 'Flick phone up or down to shoot' : 'Trigger paused'}</p>
        <label>Sensitivity: {threshold}°/s
          <input aria-label="Flick threshold" type="range" min={20} max={360} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        <meter aria-label="Flick strength" min={0} max={threshold} value={Math.min(strength, threshold)} />
      </>}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
