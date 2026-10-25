// Shared data shapes for the UI. Keep these in sync with the backend team's API.

export interface User {
  id: string
  displayName: string
  avatarColor: string
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
  /** The bounty rotates through every member once per round. */
  roundDurationDays: number
  bountyPlayerId: string | null
  /** ISO timestamp when the bounty moves to the next member. */
  bountyEndsAt: string | null
  memberIds: string[]
}

/** Optional game rules when creating a league; the server fills in defaults. */
export type LeagueRules = Partial<
  Pick<League, 'pointsPerSnipe' | 'shooterCooldownMinutes' | 'bountyBonusPoints' | 'kingBonusPoints' | 'roundDurationDays'>
>

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
