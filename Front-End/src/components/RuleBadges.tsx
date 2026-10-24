import type { League, Member } from '../types'
import { CrownIcon, TargetIcon } from './Icons'

/** King (first place) and bounty markers, with the bonus each is worth. */
export function RuleBadges({ member, league }: { member: Member; league: League | null | undefined }) {
  const bonus = (points: number | undefined) => (points ? ` +${points}` : '')
  return (
    <>
      {member.isKing && (
        <span className="badge badge-king" title="First place: sniping them earns the king bonus">
          <CrownIcon width={14} height={14} />
          King{bonus(league?.kingBonusPoints)}
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
