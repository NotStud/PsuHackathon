export class CameraRig {
  constructor(video: HTMLVideoElement, options?: { frameWidth?: number; bufferFrames?: number })
  /** performance.now() when the current recording started. */
  recordingStartedAt: number
  start(): Promise<void>
  startRecording(): void
  stopRecording(postRollMs?: number): Promise<Blob | null>
  frameAt(t: number): HTMLCanvasElement
  stop(): void
}
export function canvasToBlob(canvas: HTMLCanvasElement, type?: string, quality?: number): Promise<Blob | null>
