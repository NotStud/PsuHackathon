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
    'cooldownMinutes' | 'shooterCooldownMinutes' | 'pointsPerSnipe' | 'bountyBonusPoints' | 'kingBonusPoints' | 'bountyHours'
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
  /** Points this snipe earned, including bonuses; 0 once reversed. */
  points: number
  /** 'challenged' while the target disputes it; 'reversed' once someone else approves. */
  status: 'valid' | 'challenged' | 'reversed'
  challengeReason: string | null
  challengerId: string | null
  createdAt: string
}
