import { rimFor } from '../rims'
import type { League, Member } from '../types'
import { CrownIcon, TargetIcon } from './Icons'

/**
 * King (first place), easy target (last place) and bounty markers, with the bonus
 * each is worth. `members` is the whole leaderboard, needed to know who's last.
 */
export function RuleBadges({ member, league, members }: {
  member: Member
  league: League | null | undefined
  members?: Member[] | null
}) {
  const bonus = (points: number | undefined) => (points ? ` +${points}` : '')
  return (
    <>
      {member.isKing && (
        <span className="badge badge-king" title="First place: sniping them earns the king bonus">
          <CrownIcon width={14} height={14} />
          King{bonus(league?.kingBonusPoints)}
        </span>
      )}
      {rimFor(member, members) === 'easy-target' && (
        <span className="badge badge-easy-target" title="Last place: the easiest target in the league">
          <span className="badge-l" aria-hidden>L</span>
          Easy target
        </span>
      )}
      {member.isBounty && (
        <span className="badge badge-bounty" title="Current bounty: sniping them earns the bounty bonus">
          <TargetIcon width={14} height={14} />
          Bounty{bonus(league?.bountyBonusPoints)}
        </span>
      )}
    </>
  )
}
