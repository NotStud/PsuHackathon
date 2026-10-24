import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { getCurrentUser } from '../api'
import { MotionTrigger } from '../camera/MotionTrigger'
import { CameraView, type CameraHandle } from '../camera/CameraView'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { CloseIcon, CrosshairIcon } from '../components/Icons'
import { useAsync, useNow } from '../hooks'
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
  const capturing = useRef(false)
  const [cameraReady, setCameraReady] = useState(false)

  const me = useAsync(getCurrentUser, [])
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

  const now = useNow()
  // Players you can hit right now come first.
  const targets = (board.data ?? [])
    .filter((m) => me.data && m.user.id !== me.data.id)
    .map((m) => ({ ...m, cooldownUntil: m.cooldownUntil && Date.parse(m.cooldownUntil) > now ? m.cooldownUntil : null }))
    .sort((a, b) => Number(Boolean(a.cooldownUntil)) - Number(Boolean(b.cooldownUntil)))
  const target = targets.find((m) => m.user.id === targetId)

  const canShoot = cameraReady && Boolean(league) && !board.loading && !board.error && Boolean(me.data) && !shot

  async function shoot(steadyAt?: number) {
    if (!canShoot || capturing.current) return
    capturing.current = true
    setError(null)
    try {
      const url = await cameraRef.current?.capture(steadyAt)
      if (!url) throw new Error('Camera is not ready. Try again.')
      navigator.vibrate?.(40)
      setShot(url)
      setFlash(true)
      setTimeout(() => setFlash(false), 180)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture photo.')
    } finally { capturing.current = false }
  }

  // Space / Enter fires the shutter on desktop.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const element = e.target as HTMLElement | null
      if (e.repeat || element?.closest('button, input, select, textarea, a, [contenteditable]')) return
      if (!shot && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        shoot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function confirm() {
    if (!league || !target || !shot || submitting) return
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
      <CameraView ref={cameraRef} onReady={setCameraReady} />
      {(leagues.error || board.error || me.error) && <p className="snipe-error" role="alert">{leagues.error || board.error || me.error}</p>}
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
            disabled={Boolean(shot)}
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

      <div hidden={Boolean(shot)}><MotionTrigger armed={canShoot} onFire={(steadyAt) => { void shoot(steadyAt) }} /></div>
      {!shot && (
        <>
          <div className="snipe-reticle" aria-hidden>
            <CrosshairIcon width={96} height={96} strokeWidth={1.25} />
          </div>
          {error && <p className="snipe-error" role="alert">{error}</p>}
          <div className="snipe-bottom">
            {leagues.data?.length === 0 ? (
              <Link to="/leagues" className="button button-primary">
                Join a league to start sniping
              </Link>
            ) : (
              <button className="shutter" disabled={!canShoot} onClick={() => { void shoot() }} aria-label="Take the shot" />
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
          {!board.loading && !board.error && targets.length === 0 && <p className="muted">No other players yet. Share the league code to invite friends.</p>}
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
