import type { Rules } from '../rules'

const FIELDS: { key: keyof Rules; label: string; unit: string; min: number; max: number }[] = [
  { key: 'cooldownMinutes', label: 'Immunity after being sniped', unit: 'minutes', min: 0, max: 1440 },
  { key: 'shooterCooldownMinutes', label: 'Sniper cooldown after every shot', unit: 'minutes', min: 0, max: 1440 },
  { key: 'pointsPerSnipe', label: 'Points per snipe', unit: 'points', min: 1, max: 1000 },
  { key: 'bountyBonusPoints', label: 'Bounty bonus', unit: 'points', min: 0, max: 1000 },
  { key: 'kingBonusPoints', label: 'King bonus (sniping whoever is in first)', unit: 'points', min: 0, max: 1000 },
  { key: 'bountyHours', label: 'Bounty switches to the next player every', unit: 'hours', min: 1, max: 720 },
  { key: 'headshotBonusPoints', label: 'Headshot bonus', unit: 'points', min: 0, max: 1000 },
  { key: 'challengeVotes', label: 'Yes votes a challenge needs to pass', unit: 'votes', min: 1, max: 5 },
]

/** One number input per game rule, used when creating a league and when its creator edits it. */
export function RulesFields({ rules, onChange }: { rules: Rules; onChange: (rules: Rules) => void }) {
  return (
    <>
      {FIELDS.map((field) => (
        <label key={field.key} className="field">
          <span>{field.label}</span>
          <span className="input-unit">
            <input
              type="number"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={1}
              required
              value={Number.isNaN(rules[field.key]) ? '' : rules[field.key]}
              onChange={(e) => onChange({ ...rules, [field.key]: e.target.valueAsNumber })}
            />
            <span className="muted small">{field.unit}</span>
          </span>
        </label>
      ))}
    </>
  )
}
