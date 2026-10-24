// Stand-in for the camera, which is being built on a separate branch.
// It does NOT access the camera. It only keeps the snipe screen working until
// the real CameraView is merged in. The real one should keep this contract:
//   - render a full-bleed live preview (it fills its parent)
//   - expose `capture()` via ref, resolving to a media URL, or null if cancelled
// The snipe screen owns the shutter button and everything drawn on top.

import { useImperativeHandle, type Ref } from 'react'

export interface CameraHandle {
  capture: () => Promise<string | null>
}

const PLACEHOLDER_SHOT =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
      <rect width="300" height="400" fill="#2a2a33"/>
      <text x="150" y="205" fill="#9a9aa8" font-family="system-ui" font-size="16" text-anchor="middle">Placeholder shot</text>
    </svg>`,
  )

export function CameraView({ ref }: { ref: Ref<CameraHandle> }) {
  useImperativeHandle(ref, () => ({
    capture: () => Promise.resolve(PLACEHOLDER_SHOT),
  }))

  return (
    <div className="camera">
      <p className="camera-hint">Camera preview goes here</p>
    </div>
  )
}
