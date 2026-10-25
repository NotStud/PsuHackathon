export class CameraRig {
  constructor(video: HTMLVideoElement, options?: { frameWidth?: number; bufferFrames?: number })
  /** performance.now() when the current recording started. */
  recordingStartedAt: number
  /** How much of the zoom is a centered crop (1 = none); the preview and clip need scaling by it. */
  digitalZoom: number
  start(): Promise<void>
  /** Zoom to `level` (1 = none), with the camera's own zoom where possible. Returns `digitalZoom`. */
  setZoom(level: number): number
  startRecording(): void
  stopRecording(postRollMs?: number): Promise<Blob | null>
  frameAt(t: number): HTMLCanvasElement
  stop(): void
}
export function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number): Promise<Blob | null>
