import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { CURRENT_USER_ID } from '../api/mockData'
import { CameraView, type CameraHandle } from '../camera/CameraView'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { CloseIcon, CrosshairIcon } from '../components/Icons'
import { useAsync } from '../hooks'
import type { League, Member } from '../types'

const LAST_LEAGUE_KEY = 'snipe:lastLeague'

function loadLastLeague(): string | null {
  try {
    return localStorage.getItem(LAST_LEAGUE_KEY)
  } catch {
    return null
  }
}

function saveLastLeague(id: string) {
  try {
    localStorage.setItem(LAST_LEAGUE_KEY, id)
  } catch {
    // Storage unavailable (private mode etc.); just don't remember.
  }
}

/** ?league= wins, then the league used last time, then the first one. */
function pickLeague(requested: string | null, leagues: League[] | null): League | undefined {
  if (!leagues) return undefined
  const byId = (id: string | null) => leagues.find((l) => l.id === id)
  return byId(requested) ?? byId(loadLastLeague()) ?? leagues[0]
}

/**
 * Full-screen, camera-first snipe flow built for speed:
 * the camera is live the moment the screen opens, the shutter sits in the thumb
 * zone, and choosing *who* you hit happens after the shot, once the moment is captured.
 */
export function SnipePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cameraRef = useRef<CameraHandle>(null)

  const leagues = useAsync(getMyLeagues, [])
  const league = pickLeague(params.get('league'), leagues.data)
  const board = useAsync(
    () => (league ? getLeaderboard(league.id) : Promise.resolve([])),
    [league?.id],
  )

  const [shot, setShot] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Member | null>(null)

  // Players you can hit right now come first.
  const targets = (board.data ?? [])
    .filter((m) => m.user.id !== CURRENT_USER_ID)
    .sort((a, b) => Number(Boolean(a.cooldownUntil)) - Number(Boolean(b.cooldownUntil)))
  const target = targets.find((m) => m.user.id === targetId)

  async function shoot() {
    if (shot) return
    navigator.vibrate?.(40)
    const url = await cameraRef.current?.capture()
    if (!url) return
    setShot(url)
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
  }

  // Space / Enter fires the shutter on desktop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!shot && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        shoot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function confirm() {
    if (!league || !target) return
    setSubmitting(true)
    setError(null)
    try {
      await submitSnipe(league.id, target.user.id, shot)
      saveLastLeague(league.id)
      navigator.vibrate?.([30, 50, 30])
      setDone(target)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setShot(null)
    setTargetId(null)
    setError(null)
    setDone(null)
    board.reload()
  }

  function changeLeague(id: string) {
    saveLastLeague(id)
    setParams({ league: id }, { replace: true })
    setTargetId(null)
  }

  return (
    <div className="snipe-screen">
      <CameraView ref={cameraRef} />
      {shot && <img className="snipe-shot" src={shot} alt="Your shot" />}
      {flash && <div className="snipe-flash" />}

      <div className="snipe-top">
        <button
          className="snipe-round-button"
          onClick={() => navigate('/leagues')}
          aria-label="Close camera"
        >
          <CloseIcon />
        </button>
        {leagues.data && leagues.data.length > 0 && league && (
          <select
            className="snipe-league"
            value={league.id}
            onChange={(e) => changeLeague(e.target.value)}
            aria-label="League"
          >
            {leagues.data.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!shot && (
        <>
          <div className="snipe-reticle" aria-hidden>
            <CrosshairIcon width={96} height={96} strokeWidth={1.25} />
          </div>
          <div className="snipe-bottom">
            {leagues.data?.length === 0 ? (
              <Link to="/leagues" className="button button-primary">
                Join a league to start sniping
              </Link>
            ) : (
              <button className="shutter" onClick={shoot} aria-label="Take the shot" />
            )}
          </div>
        </>
      )}

      {shot && !done && (
        <div className="sheet" role="dialog" aria-label="Who did you get?">
          <div className="sheet-header">
            <h2>Who did you get?</h2>
            <button className="button" onClick={reset}>
              Retake
            </button>
          </div>
          {board.loading && !board.data && <p className="muted">Loading players…</p>}
          <ul className="target-grid">
            {targets.map((m) => (
              <li key={m.user.id}>
                <button
                  className={targetId === m.user.id ? 'target selected' : 'target'}
                  disabled={Boolean(m.cooldownUntil)}
                  onClick={() => setTargetId(m.user.id)}
                  aria-pressed={targetId === m.user.id}
                >
                  <Avatar user={m.user} size={48} />
                  <span>{m.user.displayName}</span>
                  {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} />}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="error">{error}</p>}
          <button
            className="button button-primary button-block button-large"
            disabled={!target || submitting}
            onClick={confirm}
          >
            {submitting ? 'Sending…' : target ? `Snipe ${target.user.displayName}` : 'Tap who you got'}
          </button>
        </div>
      )}

      {done && league && (
        <div className="snipe-success">
          <div className="success-icon">
            <CrosshairIcon width={56} height={56} />
          </div>
          <h1>Sniped!</h1>
          <p>
            <strong>{done.user.displayName}</strong> · +{league.pointsPerSnipe} points
          </p>
          <p className="small">They're safe for the next {league.cooldownMinutes} minutes.</p>
          <div className="button-row">
            <Link to={`/leagues/${league.id}`} className="button">
              Leaderboard
            </Link>
            <button className="button button-primary" onClick={reset}>
              Snipe again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
