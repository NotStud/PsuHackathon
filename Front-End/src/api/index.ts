import type { FiredShot, League, LeagueRules, Member, Snipe, User } from '../types'

// Testing aid: open any page with ?simulate=first to see the app as if you were in
// first place in every league (only on this device; the server's scores don't change).
// ?simulate=off turns it back off.
const SIMULATE_KEY = 'snipe:simulate'
try {
  const simulate = new URLSearchParams(window.location.search).get('simulate')
  if (simulate === 'off') localStorage.removeItem(SIMULATE_KEY)
  else if (simulate) localStorage.setItem(SIMULATE_KEY, simulate)
} catch { /* storage unavailable: nothing to simulate */ }
const simulating = () => {
  try { return localStorage.getItem(SIMULATE_KEY) } catch { return null }
}

/** The leaderboard with `me` moved into sole first place (see ?simulate=first). */
function asFirstPlace(board: Member[], me: User): Member[] {
  const top = Math.max(0, ...board.filter((m) => m.user.id !== me.id).map((m) => m.points))
  return board
    .map((m) => (m.user.id === me.id ? { ...m, points: Math.max(m.points, top + 1), isKing: true } : { ...m, isKing: false }))
    .sort((a, b) => b.points - a.points)
}

const TOKEN_KEY = 'snipe:token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('snipe:lastLeague')
}
export async function signOut() {
  await request('/logout', {})
  clearSession()
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    if (response.status === 401 && path !== '/session') {
      clearSession()
      window.location.assign('/login')
    }
    const error = await response.json().catch(() => null)
    const detail = error?.detail
    const message = Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join(' ') : detail
    throw new Error(typeof message === 'string' ? message : `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function signIn(email: string, password: string): Promise<User> {
  const result = await request<{ token: string; user: User }>('/session', { email, password })
  localStorage.setItem(TOKEN_KEY, result.token)
  return result.user
}
export async function signUp(name: string, email: string, password: string): Promise<User> {
  const result = await request<{ token: string; user: User }>('/signup', { name, email, password })
  localStorage.setItem(TOKEN_KEY, result.token)
  return result.user
}
export const getAuthStatus = () => request<{ authenticated: boolean; canUpgrade: boolean }>('/auth/status')
export const getCurrentUser = () => request<User>('/me')
export const getMyLeagues = () => request<League[]>('/leagues')
export const getLeague = (id: string) => request<League>(`/leagues/${id}`)
export async function getLeaderboard(id: string) {
  const board = await request<Member[]>(`/leagues/${id}/leaderboard`)
  return simulating() === 'first' ? asFirstPlace(board, await getCurrentUser()) : board
}
export const getFeed = (id: string) => request<Snipe[]>(`/leagues/${id}/feed`)
export const joinLeague = (joinCode: string) => request<League>('/leagues/join', { joinCode })
export const createLeague = (name: string, rules: LeagueRules = {}) =>
  request<League>('/leagues', { name, ...rules })
/** League creator only. */
export const updateLeagueRules = (leagueId: string, rules: LeagueRules) =>
  request<League>(`/leagues/${leagueId}/rules`, rules)
/** Tell the server a shot was fired: starts the sniper cooldown and pauses immunity at this moment. */
export const fireShot = (leagueId: string, requestId: string) =>
  request<FiredShot>(`/leagues/${leagueId}/shots`, { requestId })
/** A small image data URL, or null to remove the photo. */
export const setAvatar = (avatarUrl: string | null) => request<User>('/me/avatar', { avatarUrl })
/** The target challenges to reverse a snipe; the shooter challenges to claim a headshot. */
export const challengeSnipe = (leagueId: string, snipeId: string, reason: string) =>
  request<Snipe>(`/leagues/${leagueId}/snipes/${snipeId}/challenge`, { reason })
/** Yes or no on a challenge; can be changed until the vote is settled. */
export const voteOnChallenge = (leagueId: string, challengeId: string, approve: boolean) =>
  request<Snipe>(`/leagues/${leagueId}/challenges/${challengeId}/vote`, { approve })
/** requestId makes retries safe: sending the same shot twice records it once. */
export async function submitSnipe(
  leagueId: string,
  targetId: string,
  photoUrl: string | null,
  requestId?: string,
  crosshair?: string,
  headshot = false,
): Promise<Snipe> {
  // Camera object URLs only exist in this browser; persist the image bytes instead.
  if (photoUrl?.startsWith('blob:')) {
    const blob = await (await fetch(photoUrl)).blob()
    photoUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Unable to read photo.'))
      reader.readAsDataURL(blob)
    })
  }
  return request<Snipe>(`/leagues/${leagueId}/snipes`, { targetId: Number(targetId), photoUrl, requestId, crosshair, headshot })
}
