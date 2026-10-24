export const DEFAULT_THRESHOLD: number
export interface FireInfo { firedAt: number; steadyAt: number; peakRate: number }
export class FlickTrigger {
  constructor(options?: {
    threshold?: number
    onFire?: (info: FireInfo) => void
    onSample?: (sample: { strength: number }) => void
  })
  threshold: number
  hasSensor: boolean
  static requestPermission(): Promise<void>
  arm(): void
  disarm(): void
  destroy(): void
}
