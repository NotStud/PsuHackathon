import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { CameraRig } from '../../../trigger_camera/camera.js'

export interface Shot {
  /** Sharp frame from just before the flick, as a JPEG data URL the backend can persist. */
  photo: string
  /** Video from arming to just after the shot, for the kill cam. */
  clip: Blob | null
  /** Seconds into the clip when the trigger fired. */
  shotAt: number
}

export interface CameraHandle {
  /** Start recording video (and buffering frames) while the trigger is armed. */
  startRecording: () => void
  /** Stop recording without keeping anything. */
  discardRecording: () => void
  takeShot: (fired: { firedAt: number; steadyAt: number }) => Promise<Shot | null>
}

/** Live rear-camera preview built on trigger_camera's CameraRig. */
export function CameraView({ ref, onReady }: {
  ref: Ref<CameraHandle>
  onReady?: (ready: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rigRef = useRef<CameraRig | null>(null)
  const recording = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let cancelled = false
    const rig = new CameraRig(video)
    rigRef.current = rig
    rig.start().catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : 'Unable to open the camera.')
      setReady(false)
    })
    return () => {
      cancelled = true
      rig.stop()
      rigRef.current = null
      recording.current = false
    }
  }, [])

  useEffect(() => { onReady?.(ready) }, [ready, onReady])

  useImperativeHandle(ref, () => ({
    startRecording: () => {
      if (!rigRef.current || recording.current) return
      rigRef.current.startRecording()
      recording.current = true
    },
    discardRecording: () => {
      if (!rigRef.current || !recording.current) return
      recording.current = false
      void rigRef.current.stopRecording(0)
    },
    takeShot: async ({ firedAt, steadyAt }) => {
      const rig = rigRef.current
      if (!rig || !recording.current) return null
      recording.current = false
      // Grab the pre-flick frame first: stopping the recording releases the buffer.
      const photo = rig.frameAt(steadyAt).toDataURL('image/jpeg', 0.85)
      // Read the start time now: re-arming during the post-roll starts a new recording.
      const startedAt = rig.recordingStartedAt
      const clip = await rig.stopRecording(800)
      return { photo, clip, shotAt: (firedAt - startedAt) / 1000 }
    },
  }))

  return (
    <div className="camera">
      <video ref={videoRef} autoPlay muted playsInline onPlaying={() => setReady(true)} />
      {!ready && <p className="camera-hint" role="status">{error ?? 'Opening camera…'}</p>}
    </div>
  )
}
