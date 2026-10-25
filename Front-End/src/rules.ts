import type { LeagueRules } from './types'

export type Rules = Required<LeagueRules>

/** Starting values for a new league. They match the server's defaults (LeagueInput in league_api.py). */
export const DEFAULT_RULES: Rules = {
  cooldownMinutes: 30,
  shooterCooldownMinutes: 5,
  pointsPerSnipe: 1,
  bountyBonusPoints: 2,
  kingBonusPoints: 2,
  bountyHours: 24,
  headshotBonusPoints: 2,
  challengeVotes: 1,
}
