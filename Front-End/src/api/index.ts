import type { League, LeagueRules, Member, Snipe, User } from '../types'

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
export const getLeaderboard = (id: string) => request<Member[]>(`/leagues/${id}/leaderboard`)
export const getFeed = (id: string) => request<Snipe[]>(`/leagues/${id}/feed`)
export const joinLeague = (joinCode: string) => request<League>('/leagues/join', { joinCode })
export const createLeague = (name: string, cooldownMinutes: number, rules: LeagueRules = {}) =>
  request<League>('/leagues', { name, cooldownMinutes, ...rules })
export const challengeSnipe = (leagueId: string, snipeId: string, reason: string) =>
  request<Snipe>(`/leagues/${leagueId}/snipes/${snipeId}/challenge`, { reason })
export const approveChallenge = (leagueId: string, snipeId: string) =>
  request<Snipe>(`/leagues/${leagueId}/snipes/${snipeId}/approve`, {})
/** requestId makes retries safe: sending the same shot twice records it once. */
export async function submitSnipe(
  leagueId: string,
  targetId: string,
  photoUrl: string | null,
  requestId?: string,
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
  return request<Snipe>(`/leagues/${leagueId}/snipes`, { targetId: Number(targetId), photoUrl, requestId })
}
