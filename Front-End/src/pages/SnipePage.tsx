import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { getCurrentUser } from '../api'
import { MotionTrigger } from '../camera/MotionTrigger'
import { CameraView, type CameraHandle, type Shot } from '../camera/CameraView'
import { ShotReview } from '../camera/KillCam'
import { bang } from '../camera/feedback'
import type { FireInfo } from '../../../trigger_camera/trigger.js'
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
 * the camera is live the moment the screen opens, one Start tap arms the flick
 * trigger (and starts recording), a flick of the phone takes the shot, and choosing
 * *who* you hit happens after, over the kill cam and hit photo.
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

  const [started, setStarted] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
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

  // Record while the trigger is armed, so the kill cam has the run-up to the shot.
  useEffect(() => {
    if (started && canShoot) cameraRef.current?.startRecording()
  }, [started, canShoot])

  async function shoot(fired: FireInfo) {
    if (!canShoot || capturing.current) return
    capturing.current = true
    setError(null)
    bang()
    setFlash(true)
    setTimeout(() => setFlash(false), 180)
    try {
      const taken = await cameraRef.current?.takeShot(fired)
      if (!taken) throw new Error('Camera is not ready. Try again.')
      setShot(taken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture photo.')
    } finally { capturing.current = false }
  }

  async function confirm() {
    if (!league || !target || !shot || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitSnipe(league.id, target.user.id, shot.photo)
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

  // Throw the shot away and go back to the plain preview; Start re-arms.
  function backToStart() {
    reset()
    setStarted(false)
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
      {shot && <ShotReview shot={shot} />}
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
              <MotionTrigger started={started} onStart={() => setStarted(true)} armed={canShoot}
                onFire={(fired) => { void shoot(fired) }} />
            )}
          </div>
        </>
      )}

      {shot && !done && (
        <div className="sheet" role="dialog" aria-label="Who did you get?">
          <div className="sheet-header">
            <h2>Who did you get?</h2>
            <button className="button" onClick={backToStart}>
              Back to start
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
            {submitting ? 'Sending…' : target ? `Send: snipe ${target.user.displayName}` : 'Tap who you got'}
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
