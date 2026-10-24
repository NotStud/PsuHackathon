import type { League, Snipe, User } from '../types'

export const CURRENT_USER_ID = 'u1'

export const users: User[] = [
  { id: 'u1', displayName: 'You', avatarColor: '#f97316' },
  { id: 'u2', displayName: 'Maya', avatarColor: '#22c55e' },
  { id: 'u3', displayName: 'Jordan', avatarColor: '#3b82f6' },
  { id: 'u4', displayName: 'Priya', avatarColor: '#a855f7' },
  { id: 'u5', displayName: 'Sam', avatarColor: '#eab308' },
  { id: 'u6', displayName: 'Diego', avatarColor: '#ec4899' },
]

export const leagues: League[] = [
  {
    id: 'l1',
    name: 'PSU Hackers',
    joinCode: 'HACK26',
    cooldownMinutes: 60,
    pointsPerSnipe: 10,
    memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
  },
  {
    id: 'l2',
    name: 'Floor 3 East',
    joinCode: 'F3EAST',
    cooldownMinutes: 120,
    pointsPerSnipe: 15,
    memberIds: ['u1', 'u3', 'u5'],
  },
]

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const snipes: Snipe[] = [
  { id: 's1', leagueId: 'l1', sniperId: 'u2', targetId: 'u3', photoUrl: null, createdAt: minutesAgo(12) },
  { id: 's2', leagueId: 'l1', sniperId: 'u1', targetId: 'u4', photoUrl: null, createdAt: minutesAgo(45) },
  { id: 's3', leagueId: 'l1', sniperId: 'u5', targetId: 'u2', photoUrl: null, createdAt: minutesAgo(180) },
  { id: 's4', leagueId: 'l1', sniperId: 'u2', targetId: 'u6', photoUrl: null, createdAt: minutesAgo(300) },
  { id: 's5', leagueId: 'l2', sniperId: 'u3', targetId: 'u1', photoUrl: null, createdAt: minutesAgo(30) },
]
