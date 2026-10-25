import type { Member } from './types'

/** Special avatar border ("rim") a leaderboard position earns. */
export type Rim = 'king' | 'easy-target'

/**
 * The king (first place) gets a gold rim and crown; last place is the "easy target":
 * a brown rim with an "L" on top.
 * Ties count for both. While everyone is level (e.g. all on 0 at the start of a
 * league) nobody is really first or last, so neither rim appears.
 */
export function rimFor(member: Member, members: Member[] | null | undefined): Rim | undefined {
  if (!members?.length) return undefined
  const points = members.map((m) => m.points)
  const top = Math.max(...points), bottom = Math.min(...points)
  if (top === bottom) return undefined
  if (member.isKing && member.points > 0) return 'king'
  if (member.points === bottom) return 'easy-target'
  return undefined
}
