import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fireShot, getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { getCurrentUser } from '../api'
import { MotionTrigger } from '../camera/MotionTrigger'
import { CameraView, type CameraHandle, type Shot } from '../camera/CameraView'
import { ShotReview } from '../camera/KillCam'
import { KillCamActions } from '../camera/KillCamActions'
import { bang, playHit, playReload } from '../camera/feedback'
import type { FireInfo } from '../../../trigger_camera/trigger.js'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { RuleBadges } from '../components/RuleBadges'
import { CloseIcon, CrosshairIcon } from '../components/Icons'
import { Crosshair } from '../components/Crosshair'
import { countdown } from '../format'
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
  // One ID per shot, so a retried send can't record the same snipe twice.
  const [requestId, setRequestId] = useState<string | null>(null)
  // When the shot was fired: target immunity is shown (and judged by the server) as of this moment.
  const [firedAt, setFiredAt] = useState<number | null>(null)
  // Sniper cooldown from the last shot fired, hit or miss.
  const [shotReload, setShotReload] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ member: Member; points: number } | null>(null)

  const now = useNow()
  // Immunity timers pause at the moment of the shot while you pick who you hit.
  const judgeAt = firedAt ?? now
  // Players you could hit when you fired come first.
  const targets = (board.data ?? [])
    .filter((m) => me.data && m.user.id !== me.data.id)
    .map((m) => ({ ...m, cooldownUntil: m.cooldownUntil && Date.parse(m.cooldownUntil) > judgeAt ? m.cooldownUntil : null }))
    .sort((a, b) => Number(Boolean(a.cooldownUntil)) - Number(Boolean(b.cooldownUntil)))
  const target = targets.find((m) => m.user.id === targetId)
  // Sniper cooldown: after every shot you have to wait before the next one.
  const myRow = board.data?.find((m) => me.data && m.user.id === me.data.id)
  const reloadUntil =
    [myRow?.shooterCooldownUntil, shotReload]
      .filter((t): t is string => Boolean(t) && Date.parse(t!) > now)
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null

  const canShoot =
    cameraReady && Boolean(league) && !board.loading && !board.error && Boolean(me.data) && !shot && !reloadUntil

  // Record while the trigger is armed, so the kill cam has the run-up to the shot.
  useEffect(() => {
    if (!started || !canShoot) return
    cameraRef.current?.startRecording()
    playReload()
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
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      setShot(taken)
      setRequestId(id)
      setFiredAt(Date.now())
      // Starts the sniper cooldown even if this shot is never sent.
      if (league) {
        fireShot(league.id, id).then(
          (fired) => setShotReload(fired.reloadUntil),
          (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture photo.')
    } finally { capturing.current = false }
  }

  async function confirm() {
    if (!league || !target || !shot || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const snipe = await submitSnipe(league.id, target.user.id, shot.photo, requestId ?? undefined)
      saveLastLeague(league.id)
      navigator.vibrate?.([30, 50, 30])
      playHit()
      setDone({ member: target, points: snipe.points })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setShot(null)
    setRequestId(null)
    setFiredAt(null)
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
            <Crosshair size={96} />
          </div>
          {error && <p className="snipe-error" role="alert">{error}</p>}
          <div className="snipe-bottom">
            {reloadUntil && (
              <p className="snipe-notice">
                Reloading: you can snipe again in <CooldownBadge until={reloadUntil} kind="reloading" />
              </p>
            )}
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
          <p className="muted small">Immunity timers are paused at the moment you fired.</p>
          {shot.clip && <KillCamActions clip={shot.clip} />}
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
                  <RuleBadges member={m} league={league} />
                  {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} frozenAt={firedAt ?? undefined} />}
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
            <strong>{done.member.user.displayName}</strong> · +{done.points} points
          </p>
          <p className="small">They're safe for the next {league.cooldownMinutes} minutes.</p>
          {shot?.clip && <KillCamActions clip={shot.clip} />}
          <div className="button-row">
            <Link to={`/leagues/${league.id}`} className="button">
              Leaderboard
            </Link>
            {/* The next shot unlocks when the sniper cooldown ends. */}
            {reloadUntil ? (
              <span className="button button-countdown" role="timer" aria-live="polite">
                Next shot in {countdown(reloadUntil, now)}
              </span>
            ) : (
              <button className="button button-primary" onClick={reset}>
                Snipe again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
