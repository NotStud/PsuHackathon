/** Auto-plays and loops the clip from 2 s before shotAt; returns a function that stops it. */
export function playKillCam(
  video: HTMLVideoElement,
  clip: Blob,
  shotAt: number,
  options?: { onShot?: () => void },
): () => void
