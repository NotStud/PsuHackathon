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
  /** 'challenged' while a challenge is being voted on; 'reversed' once a reversal passes. */
  status: 'valid' | 'challenged' | 'reversed'
  /** Seen by the app when it was taken, or upheld by a vote. */
  headshot: boolean
  challenges: Challenge[]
  createdAt: string
}

/**
 * A challenge to a snipe, voted on by everyone but the shooter and the target. The target
 * asks for a reversal ('reverse'); the shooter claims a headshot ('headshot').
 */
export interface Challenge {
  id: string
  kind: 'reverse' | 'headshot'
  challengerId: string
  reason: string
  /** 'approved' at votesNeeded yes votes; 'rejected' at votesNeeded no votes (or once yes can't get there). */
  status: 'pending' | 'approved' | 'rejected'
  yesVotes: number
  noVotes: number
  votesNeeded: number
  /** How the current player voted, if they did. */
  myVote: 'yes' | 'no' | null
  createdAt: string
}
