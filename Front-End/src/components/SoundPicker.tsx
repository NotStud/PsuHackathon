import { playShot, SHOT_SOUNDS, unlockAudio, useShotSound } from '../camera/feedback'

/** Choose the gunshot sound; tapping one also plays it. "Off" mutes every effect. */
export function SoundPicker() {
  const [choice, setChoice] = useShotSound()
  return (
    <div className="sound-picker" role="radiogroup" aria-label="Gunshot sound">
      {SHOT_SOUNDS.filter((s) => !s.hidden).map((s) => (
        <button key={s.id} role="radio" aria-checked={choice.shot === s.id}
          className={choice.shot === s.id ? 'sound-option selected' : 'sound-option'}
          onClick={() => {
            unlockAudio()
            setChoice({ shot: s.id })
            playShot(s.id)
          }}>
          {s.name}
        </button>
      ))}
    </div>
  )
}
