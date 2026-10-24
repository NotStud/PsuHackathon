import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'

export interface CameraHandle {
  capture: () => Promise<string | null>
}

/** Live device preview; capture returns image bytes that the backend can persist. */
export function CameraView({ ref, onReady }: {
  ref: Ref<CameraHandle>
  onReady?: (ready: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | undefined
    const video = videoRef.current

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access requires HTTPS or localhost and a supported browser.')
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (video) {
          video.srcObject = stream
          await video.play()
        }
      } catch (err) {
        stream?.getTracks().forEach((track) => track.stop())
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to open the camera.')
          setReady(false)
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
      if (video) video.srcObject = null
    }
  }, [])

  useEffect(() => { onReady?.(ready) }, [ready, onReady])

  useImperativeHandle(ref, () => ({
    capture: async () => {
      const video = videoRef.current
      if (!ready || !video?.videoWidth || !video.videoHeight) return null
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.8)
    },
  }))

  return (
    <div className="camera">
      <video ref={videoRef} autoPlay muted playsInline onPlaying={() => setReady(true)} />
      {!ready && <p className="camera-hint" role="status">{error ?? 'Opening camera…'}</p>}
    </div>
  )
}
