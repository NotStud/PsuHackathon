import { useEffect, useRef, type TouchEvent, type TouchList } from 'react'

const MAX_ZOOM = 8

/** 1 to MAX_ZOOM, in tenths (so pinching doesn't re-zoom the camera on every tiny move). */
const clampZoom = (zoom: number) => Math.round(Math.min(MAX_ZOOM, Math.max(1, zoom)) * 10) / 10

/** Touch handlers that pinch-zoom (spread two fingers to zoom in), while `enabled`. */
export function usePinchZoom(zoom: number, onChange: (zoom: number) => void, enabled: boolean) {
  const start = useRef<{ distance: number; zoom: number } | null>(null)
  const spread = (touches: TouchList) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

  // iPhone Safari zooms the whole page on a pinch unless its gesture events are cancelled.
  useEffect(() => {
    if (!enabled) return
    const stop = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', stop)
    document.addEventListener('gesturechange', stop)
    return () => {
      document.removeEventListener('gesturestart', stop)
      document.removeEventListener('gesturechange', stop)
    }
  }, [enabled])

  if (!enabled) return {}
  return {
    onTouchStart: (e: TouchEvent) => {
      if (e.touches.length === 2) start.current = { distance: spread(e.touches), zoom }
    },
    onTouchMove: (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start.current) return
      const next = clampZoom(start.current.zoom * (spread(e.touches) / start.current.distance))
      if (next !== zoom) onChange(next)
    },
    onTouchEnd: (e: TouchEvent) => {
      if (e.touches.length < 2) start.current = null
    },
  }
}
