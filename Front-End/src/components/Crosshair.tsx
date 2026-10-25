import { CROSSHAIR_COLORS, CROSSHAIRS, useCrosshair } from '../crosshairs'

/** Draws a crosshair; defaults to the player's saved style and color. */
export function Crosshair({ size, style, color }: { size: number; style?: string; color?: string }) {
  const [choice] = useCrosshair()
  const shape = CROSSHAIRS.find((c) => c.id === (style ?? choice.style)) ?? CROSSHAIRS[0]
  const value = CROSSHAIR_COLORS.find((c) => c.id === (color ?? choice.color))?.value ?? CROSSHAIR_COLORS[0].value
  return (
    <svg className="crosshair-svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ color: value }} aria-hidden>
      {shape.shape}
    </svg>
  )
}
