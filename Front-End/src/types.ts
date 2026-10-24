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
  /** Points awarded for a successful snipe. */
  pointsPerSnipe: number
  memberIds: string[]
}

export interface Member {
  user: User
  points: number
  snipes: number
  timesSniped: number
  /** ISO timestamp; the member cannot be sniped until this time. Null if not on cooldown. */
  cooldownUntil: string | null
}

export interface Snipe {
  id: string
  leagueId: string
  sniperId: string
  targetId: string
  /** Object URL or remote URL of the photo proof. */
  photoUrl: string | null
  createdAt: string
}
