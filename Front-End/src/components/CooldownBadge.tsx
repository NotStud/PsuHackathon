import { countdown } from '../format'
import { useNow } from '../hooks'
import { CrosshairIcon, ShieldIcon } from './Icons'

/**
 * Live countdown pill. 'immune' (default): the player can't be sniped yet.
 * 'reloading': the player can't snipe anyone yet (shooter cooldown).
 */
export function CooldownBadge({ until, kind = 'immune' }: { until: string; kind?: 'immune' | 'reloading' }) {
  const now = useNow()
  if (new Date(until).getTime() <= now) return null
  const reloading = kind === 'reloading'
  return (
    <span
      className={reloading ? 'badge badge-reload' : 'badge badge-cooldown'}
      title={reloading ? "Reloading, can't snipe yet" : "On cooldown, can't be sniped yet"}
    >
      {reloading ? <CrosshairIcon width={14} height={14} /> : <ShieldIcon width={14} height={14} />}
      {countdown(until, now)}
    </span>
  )
}
