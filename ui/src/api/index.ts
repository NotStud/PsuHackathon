// Mock API. Every function here is async so the UI already treats it like a
// network call. When the backend is ready, replace each body with a fetch()
// to the real endpoint and keep the same signatures.

import type { League, Member, Snipe, User } from '../types'
import { CURRENT_USER_ID, leagues, snipes, users } from './mockData'

const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))

const findUser = (id: string): User => {
  const user = users.find((u) => u.id === id)
  if (!user) throw new Error(`Unknown user ${id}`)
  return user
}

const findLeague = (id: string): League => {
  const league = leagues.find((l) => l.id === id)
  if (!league) throw new Error(`Unknown league ${id}`)
  return league
}

export async function getCurrentUser(): Promise<User> {
  await delay()
  return findUser(CURRENT_USER_ID)
}

export async function getMyLeagues(): Promise<League[]> {
  await delay()
  return leagues.filter((l) => l.memberIds.includes(CURRENT_USER_ID))
}

export async function getLeague(leagueId: string): Promise<League> {
  await delay()
  return findLeague(leagueId)
}

/** Members with stats derived from the snipe history, sorted by points. */
export async function getLeaderboard(leagueId: string): Promise<Member[]> {
  await delay()
  const league = findLeague(leagueId)
  const leagueSnipes = snipes.filter((s) => s.leagueId === leagueId)

  return league.memberIds
    .map((id): Member => {
      const made = leagueSnipes.filter((s) => s.sniperId === id)
      const received = leagueSnipes.filter((s) => s.targetId === id)
      const lastHit = received
        .map((s) => new Date(s.createdAt).getTime())
        .sort((a, b) => b - a)[0]
      const cooldownEnd = lastHit ? lastHit + league.cooldownMinutes * 60_000 : 0

      return {
        user: findUser(id),
        points: made.length * league.pointsPerSnipe,
        snipes: made.length,
        timesSniped: received.length,
        cooldownUntil: cooldownEnd > Date.now() ? new Date(cooldownEnd).toISOString() : null,
      }
    })
    .sort((a, b) => b.points - a.points)
}

export async function getFeed(leagueId: string): Promise<Snipe[]> {
  await delay()
  return snipes
    .filter((s) => s.leagueId === leagueId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function submitSnipe(
  leagueId: string,
  targetId: string,
  photoUrl: string | null,
): Promise<Snipe> {
  await delay(500)
  const board = await getLeaderboard(leagueId)
  const target = board.find((m) => m.user.id === targetId)
  if (!target) throw new Error('That player is not in this league.')
  if (target.cooldownUntil) throw new Error(`${target.user.displayName} is still on cooldown.`)

  const snipe: Snipe = {
    id: `s${Date.now()}`,
    leagueId,
    sniperId: CURRENT_USER_ID,
    targetId,
    photoUrl,
    createdAt: new Date().toISOString(),
  }
  snipes.push(snipe)
  return snipe
}

export async function joinLeague(joinCode: string): Promise<League> {
  await delay()
  const league = leagues.find((l) => l.joinCode === joinCode.trim().toUpperCase())
  if (!league) throw new Error('No league found with that code.')
  if (!league.memberIds.includes(CURRENT_USER_ID)) league.memberIds.push(CURRENT_USER_ID)
  return league
}

export async function createLeague(name: string, cooldownMinutes: number): Promise<League> {
  await delay()
  const league: League = {
    id: `l${Date.now()}`,
    name: name.trim(),
    joinCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
    cooldownMinutes,
    pointsPerSnipe: 10,
    memberIds: [CURRENT_USER_ID],
  }
  leagues.push(league)
  return league
}
