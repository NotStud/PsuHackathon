import type { League, Member, Snipe, User } from '../types'

const TOKEN_KEY = 'snipe:token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export function signOut() { localStorage.removeItem(TOKEN_KEY) }

async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) {
    if (response.status === 401) {
      signOut()
      window.location.assign('/login')
    }
    const error = await response.json().catch(() => null)
    throw new Error(typeof error?.detail === 'string' ? error.detail : `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function signIn(name: string): Promise<User> {
  const result = await request<{ token: string; user: User }>('/session', { name })
  localStorage.setItem(TOKEN_KEY, result.token)
  return result.user
}
export const getCurrentUser = () => request<User>('/me')
export const getMyLeagues = () => request<League[]>('/leagues')
export const getLeague = (id: string) => request<League>(`/leagues/${id}`)
export const getLeaderboard = (id: string) => request<Member[]>(`/leagues/${id}/leaderboard`)
export const getFeed = (id: string) => request<Snipe[]>(`/leagues/${id}/feed`)
export const joinLeague = (joinCode: string) => request<League>('/leagues/join', { joinCode })
export const createLeague = (name: string, cooldownMinutes: number) =>
  request<League>('/leagues', { name, cooldownMinutes })
export async function submitSnipe(leagueId: string, targetId: string, photoUrl: string | null): Promise<Snipe> {
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
  return request<Snipe>(`/leagues/${leagueId}/snipes`, { targetId: Number(targetId), photoUrl })
}
