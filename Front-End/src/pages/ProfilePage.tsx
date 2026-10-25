import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentUser, getLeaderboard, getMyLeagues, signOut } from '../api'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { CrosshairPicker } from '../components/CrosshairPicker'
import { SoundPicker } from '../components/SoundPicker'
import { PageHeader } from '../components/PageHeader'
import { useAsync } from '../hooks'

export function ProfilePage() {
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const user = useAsync(getCurrentUser, [])
  // Pull this user's row from each league they're in.
  const stats = useAsync(async () => {
    const [me, leagues] = await Promise.all([getCurrentUser(), getMyLeagues()])
    return Promise.all(
      leagues.map(async (league) => {
        const board = await getLeaderboard(league.id)
        const index = board.findIndex((m) => m.user.id === me.id)
        return { league, member: board[index], rank: index + 1, size: board.length }
      }),
    )
  }, [])

  const totals = stats.data?.reduce(
    (acc, s) => ({
      points: acc.points + s.member.points,
      snipes: acc.snipes + s.member.snipes,
      timesSniped: acc.timesSniped + s.member.timesSniped,
    }),
    { points: 0, snipes: 0, timesSniped: 0 },
  )

  return (
    <>
      <PageHeader title="Profile" />

      {(user.error || stats.error) && <p className="error">{user.error || stats.error}</p>}
      {user.data && (
        <div className="profile-hero">
          <Avatar user={user.data} size={80} />
          <h2>{user.data.displayName}</h2>
        </div>
      )}

      {totals && (
        <div className="stat-row">
          <div className="stat">
            <span className="stat-value">{totals.points}</span>
            <span className="muted small">Points</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totals.snipes}</span>
            <span className="muted small">Snipes</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totals.timesSniped}</span>
            <span className="muted small">Times sniped</span>
          </div>
        </div>
      )}

      <h2 className="section-title">By league</h2>
      {stats.loading && <p className="muted">Loading…</p>}
      <ul className="list">
        {stats.data?.map(({ league, member, rank, size }) => (
          <li key={league.id} className="row">
            <div className="row-main">
              <span className="row-name">{league.name}</span>
              <span className="muted small">
                #{rank} of {size} · {member.points} pts
              </span>
            </div>
            {member.cooldownUntil && <CooldownBadge until={member.cooldownUntil} />}
          </li>
        ))}
      </ul>

      <h2 className="section-title">Crosshair</h2>
      <CrosshairPicker />

      <h2 className="section-title">Gunshot sound</h2>
      <p className="muted small">Tap to hear it. Off mutes all game sounds.</p>
      <SoundPicker />

      {logoutError && <p className="error" role="alert">{logoutError}</p>}
      <button className="button button-block" disabled={signingOut} onClick={async () => {
        setSigningOut(true)
        setLogoutError(null)
        try { await signOut(); navigate('/login') }
        catch { setLogoutError('Unable to sign out. Please try again.') }
        finally { setSigningOut(false) }
      }}>
        Sign out
      </button>
    </>
  )
}
