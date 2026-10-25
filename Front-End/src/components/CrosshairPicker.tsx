import { CROSSHAIR_COLORS, CROSSHAIRS, useCrosshair } from '../crosshairs'
import { Crosshair } from './Crosshair'

/**
 * Choose the crosshair shown on the snipe screen, kill cam, and hit photo.
 * The limited ones only appear while you're in first place (in any league).
 */
export function CrosshairPicker({ firstPlace }: { firstPlace: boolean }) {
  const [choice, setChoice] = useCrosshair()
  const lockedPick = !firstPlace && CROSSHAIRS.find((c) => c.id === choice.style)?.limited
  return (
    <div className="crosshair-picker">
      <div className="crosshair-preview" aria-hidden>
        <Crosshair size={88} />
      </div>
      <div className="crosshair-styles" role="radiogroup" aria-label="Crosshair style">
        {CROSSHAIRS.filter((c) => !c.hidden && (!c.limited || firstPlace)).map((c) => (
          <button key={c.id} role="radio" aria-checked={choice.style === c.id}
            className={`crosshair-option${choice.style === c.id ? ' selected' : ''}${c.limited ? ' limited' : ''}`}
            title={c.limited ? 'Limited: first place only' : undefined}
            onClick={() => setChoice({ style: c.id })}>
            {c.limited && <span className="limited-tag">Limited</span>}
            <Crosshair size={36} style={c.id} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      {lockedPick && (
        <p className="muted small">You're not in first place anymore, so you'll shoot with Classic until you're back on top.</p>
      )}
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
