import { countdown } from '../format'
import { useNow } from '../hooks'
import { CrosshairIcon, PauseIcon, ShieldIcon } from './Icons'

/**
 * Live countdown pill. 'immune' (default): the player can't be sniped yet.
 * 'reloading': the player can't snipe anyone yet (shooter cooldown).
 * With frozenAt, the timer stays paused at that moment (the time of your shot).
 */
export function CooldownBadge({ until, kind = 'immune', frozenAt }: {
  until: string
  kind?: 'immune' | 'reloading'
  frozenAt?: number
}) {
  const live = useNow()
  const now = frozenAt ?? live
  if (new Date(until).getTime() <= now) return null
  const reloading = kind === 'reloading'
  return (
    <span
      className={reloading ? 'badge badge-reload' : 'badge badge-cooldown'}
      title={reloading ? "Reloading, can't snipe yet" : "On cooldown, can't be sniped yet"}
    >
      {frozenAt !== undefined ? (
        <PauseIcon width={14} height={14} />
      ) : reloading ? (
        <CrosshairIcon width={14} height={14} />
      ) : (
        <ShieldIcon width={14} height={14} />
      )}
      {countdown(until, now)}
    </span>
  )
}
