import type { Member } from './types'

/** Special avatar border ("rim") a leaderboard position earns. */
export type Rim = 'king'

/**
 * The king (first place) gets a gold rim and crown. Ties count, so at the start of a
 * league everyone would be king; the rim only appears once the king has points.
 */
export function rimFor(member: Member): Rim | undefined {
  if (member.isKing && member.points > 0) return 'king'
  return undefined
}
