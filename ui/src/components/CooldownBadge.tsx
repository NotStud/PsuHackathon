import { countdown } from '../format'
import { useNow } from '../hooks'
import { ShieldIcon } from './Icons'

/** Live countdown pill shown while a player is protected from being sniped. */
export function CooldownBadge({ until }: { until: string }) {
  const now = useNow()
  if (new Date(until).getTime() <= now) return null
  return (
    <span className="badge badge-cooldown" title="On cooldown, can't be sniped yet">
      <ShieldIcon width={14} height={14} />
      {countdown(until, now)}
    </span>
  )
}
