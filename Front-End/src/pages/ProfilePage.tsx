import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, getLeaderboard, getMyLeagues, signOut } from '../api'
import { AvatarEditor } from '../components/AvatarEditor'
import { CooldownBadge } from '../components/CooldownBadge'
import { CrosshairPicker } from '../components/CrosshairPicker'
import { SoundPicker } from '../components/SoundPicker'
import { PageHeader } from '../components/PageHeader'
import { InstallTips } from '../components/InstallTips'
import { useAsync } from '../hooks'
import { rimFor } from '../rims'
import { ChevronRightIcon, ShieldIcon, SignOutIcon } from '../components/Icons'

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
        return { league, member: board[index], rank: index + 1, size: board.length, rim: rimFor(board[index], board) }
      }),
    )
  }, [])

  // First place in any league unlocks the limited crosshair and sound.
  const firstPlace = stats.data?.some((s) => s.rim === 'king') ?? false
  // Last place in a league overrides these picks there (same notice as the snipe screen).
  const lastIn = stats.data?.filter((s) => s.rim === 'easy-target').map((s) => s.league.name) ?? []

  const totals = stats.data?.reduce(
    (acc, s) => ({
      points: acc.points + s.member.points,
      snipes: acc.snipes + s.member.snipes,
      timesSniped: acc.timesSniped + s.member.timesSniped,
    }),
    { points: 0, snipes: 0, timesSniped: 0 },
  )

  return (
    <div className="profile-page">
      <PageHeader title="Profile" />

      {(user.error || stats.error) && <p className="error">{user.error || stats.error}</p>}
      {user.data && (
        <div className="profile-hero">
          <AvatarEditor user={user.data} onChange={user.reload} />
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

      <div className="section-heading"><h2 className="section-title">By league</h2>
        <span>{stats.data ? `${stats.data.length} Active` : '…'}</span></div>
      {stats.loading && <p className="muted">Loading…</p>}
      <ul className="list profile-leagues">
        {stats.data?.map(({ league, member, rank, size }) => (
          <li key={league.id}>
            <Link to={`/leagues/${league.id}`} className="row">
            <span className="profile-league-icon"><ShieldIcon width={19} height={19} /></span>
            <div className="row-main">
              <span className="row-name">{league.name}</span>
              <span className="muted small">
                #{rank} of {size} · {member.points} pts
              </span>
            </div>
            {member.cooldownUntil && <CooldownBadge until={member.cooldownUntil} />}
            <ChevronRightIcon className="league-chevron" width={18} height={18} />
            </Link>
          </li>
        ))}
      </ul>

      <div className="section-heading"><h2 className="section-title">Crosshair</h2>
        <span className="live-reticle"><i /> Live reticle</span></div>
      {lastIn.length > 0 && (
        <p className="last-place-notice">
          You're in last place{stats.data!.length > 1 ? ` in ${lastIn.join(', ')}` : ''}: cracked crosshair and fart sound until you climb out.
        </p>
      )}
      <CrosshairPicker firstPlace={firstPlace} />

      <h2 className="section-title sound-heading">Gunshot sound</h2>
      <p className="muted small">Tap to hear it. Off mutes all game sounds.</p>
      <SoundPicker firstPlace={firstPlace} />

      <InstallTips />

      {logoutError && <p className="error" role="alert">{logoutError}</p>}
      <button className="button button-block signout-button" disabled={signingOut} onClick={async () => {
        setSigningOut(true)
        setLogoutError(null)
        try { await signOut(); navigate('/login') }
        catch { setLogoutError('Unable to sign out. Please try again.') }
        finally { setSigningOut(false) }
      }}>
        <SignOutIcon width={18} height={18} /> {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}
