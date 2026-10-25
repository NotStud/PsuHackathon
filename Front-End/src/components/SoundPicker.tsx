import { playShot, SHOT_SOUNDS, unlockAudio, useShotSound } from '../camera/feedback'

/**
 * Choose the gunshot sound; tapping one also plays it. "Off" mutes every effect.
 * The limited ones only appear while you're in first place (in any league).
 */
export function SoundPicker({ firstPlace }: { firstPlace: boolean }) {
  const [choice, setChoice] = useShotSound()
  const lockedPick = !firstPlace && SHOT_SOUNDS.find((s) => s.id === choice.shot)?.limited
  return (
    <>
      <div className="sound-picker" role="radiogroup" aria-label="Gunshot sound">
        {SHOT_SOUNDS.filter((s) => !s.hidden && (!s.limited || firstPlace)).map((s) => (
          <button key={s.id} role="radio" aria-checked={choice.shot === s.id}
            className={`sound-option${choice.shot === s.id ? ' selected' : ''}${s.limited ? ' limited' : ''}`}
            title={s.limited ? 'Limited: first place only' : undefined}
            onClick={() => {
              unlockAudio()
              setChoice({ shot: s.id })
              playShot(s.id)
            }}>
            {s.limited && <span className="limited-tag">Limited</span>}
            {s.name}
          </button>
        ))}
      </div>
      {lockedPick && (
        <p className="muted small">You're not in first place anymore, so you'll shoot with Realistic until you're back on top.</p>
      )}
    </>
  )
}
