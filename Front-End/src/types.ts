// Shared data shapes for the UI. Keep these in sync with the backend team's API.

export interface User {
  id: string
  displayName: string
  avatarColor: string
  /** Profile photo URL, or null to show the initial on a colored circle. */
  avatarUrl?: string | null
}

export interface League {
  id: string
  name: string
  joinCode: string
  /** How long a sniped player is protected, in minutes. */
  cooldownMinutes: number
  /** Base points for a successful snipe. */
  pointsPerSnipe: number
  /** How long a shooter must wait between snipes, in minutes. */
  shooterCooldownMinutes: number
  /** Extra points for sniping the current bounty. */
  bountyBonusPoints: number
  /** Extra points for sniping whoever is in first place. */
  kingBonusPoints: number
  /** How long each member stays the bounty before it moves to the next. */
  bountyHours: number
  /** Extra points for a headshot. */
  headshotBonusPoints: number
  /** Yes votes a challenge needs to pass (fewer if the league doesn't have that many voters). */
  challengeVotes: number
  /** Only the creator can change the rules. */
  creatorId: string | null
  bountyPlayerId: string | null
  /** ISO timestamp when the bounty moves to the next member. */
  bountyEndsAt: string | null
  memberIds: string[]
}

/** Game rules set by the league creator; the server fills in defaults for any left out. */
export type LeagueRules = Partial<
  Pick<
    League,
    | 'cooldownMinutes' | 'shooterCooldownMinutes' | 'pointsPerSnipe' | 'bountyBonusPoints' | 'kingBonusPoints'
    | 'bountyHours' | 'headshotBonusPoints' | 'challengeVotes'
  >
>

/** Returned when a shot is fired: the sniper cooldown runs until reloadUntil. */
export interface FiredShot {
  requestId: string
  firedAt: string
  reloadUntil: string
}

export interface Member {
  user: User
  points: number
  snipes: number
  timesSniped: number
  /** ISO timestamp; the member cannot be sniped until this time. Null if not on cooldown. */
  cooldownUntil: string | null
  /** ISO timestamp; the member cannot snipe anyone until this time. */
  shooterCooldownUntil: string | null
  isBounty: boolean
  /** In first place (ties included), worth the king bonus. */
  isKing: boolean
}

export interface Snipe {
  id: string
  leagueId: string
  sniperId: string
  targetId: string
  /** Object URL or remote URL of the photo proof. */
  photoUrl: string | null
  /** The shooter's crosshair as "style:color", drawn over the photo; null for older snipes. */
  crosshair?: string | null
  /** Points this snipe earned, including bonuses; 0 once reversed. */
  points: number
  /**
   * 'challenged' while a challenge is being voted on; 'reversed' once a reversal passes;
   * 'missed' for a miss that wasn't voted a hit.
   */
  status: 'valid' | 'challenged' | 'reversed' | 'missed'
  /** Seen by the app when it was taken, or upheld by a vote. */
  headshot: boolean
  /** The app called it a miss; it counts only once a 'hit' challenge passes. */
  missed: boolean
  challenges: Challenge[]
  createdAt: string
}

/**
 * A challenge to a snipe, voted on by everyone but the shooter and the target. The target
 * says no hit ('reverse') or no headshot ('no-headshot': the hit stands, the bonus goes);
 * the shooter claims a headshot ('headshot'), or that a miss was really a hit ('hit', sent
 * with the miss).
 */
export interface Challenge {
  id: string
  kind: 'reverse' | 'no-headshot' | 'headshot' | 'hit'
  challengerId: string
  /** Optional: empty when the challenger didn't write anything. */
  reason: string
  /**
   * 'approved' at votesNeeded yes votes; until then 'pending' and the snipe stands. There
   * are no no votes; 'rejected' only comes from older yes/no voting.
   */
  status: 'pending' | 'approved' | 'rejected'
  yesVotes: number
  /** Who voted yes, first vote first. */
  voterIds: string[]
  votesNeeded: number
  /** The current player has voted yes. */
  voted: boolean
  /** Passing it gives the headshot bonus: a headshot claim, or a miss claimed as a headshot hit. */
  claimsHeadshot: boolean
  createdAt: string
}
