import { CROSSHAIR_COLORS, CROSSHAIRS, useCrosshair } from '../crosshairs'
import { Crosshair } from './Crosshair'

/** Choose the crosshair shown on the snipe screen, kill cam, and hit photo. */
export function CrosshairPicker() {
  const [choice, setChoice] = useCrosshair()
  return (
    <div className="crosshair-picker">
      <div className="crosshair-preview" aria-hidden>
        <Crosshair size={88} />
      </div>
      <div className="crosshair-styles" role="radiogroup" aria-label="Crosshair style">
        {CROSSHAIRS.map((c) => (
          <button key={c.id} role="radio" aria-checked={choice.style === c.id}
            className={choice.style === c.id ? 'crosshair-option selected' : 'crosshair-option'}
            onClick={() => setChoice({ style: c.id })}>
            <Crosshair size={36} style={c.id} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <div className="crosshair-colors" role="radiogroup" aria-label="Crosshair color">
        {CROSSHAIR_COLORS.map((c) => (
          <button key={c.id} role="radio" aria-checked={choice.color === c.id} aria-label={c.name}
            className={choice.color === c.id ? 'crosshair-swatch selected' : 'crosshair-swatch'}
            style={{ background: c.value }}
            onClick={() => setChoice({ color: c.id })} />
        ))}
      </div>
    </div>
  )
}
