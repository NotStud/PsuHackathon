import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { getCurrentUser } from '../api'
import { MotionTrigger } from '../camera/MotionTrigger'
import { CameraView, type CameraHandle, type Shot } from '../camera/CameraView'
import { ShotReview } from '../camera/KillCam'
import { bang, playHit, playReload } from '../camera/feedback'
import type { PersonCheck } from '../camera/personCheck'
import type { FireInfo } from '../../../trigger_camera/trigger.js'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { RuleBadges } from '../components/RuleBadges'
import { CloseIcon, CrosshairIcon } from '../components/Icons'
import { Crosshair } from '../components/Crosshair'
import { useAsync, useNow } from '../hooks'
import type { League, Member } from '../types'

const LAST_LEAGUE_KEY = 'snipe:lastLeague'

// The person-detection library is big, so only pages that shoot load it.
const personCheck = () => import('../camera/personCheck')

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
  // Was the crosshair on a person? Worked out on the device right after the shot.
  const [check, setCheck] = useState<PersonCheck | 'checking' | 'failed' | null>(null)
  const checking = useRef<Shot | null>(null)
  const [flash, setFlash] = useState(false)
  const [targetId, setTargetId] = useState<string | null>(null)
  // One ID per shot, so a retried send can't record the same snipe twice.
  const [requestId, setRequestId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ member: Member; points: number } | null>(null)

  const now = useNow()
  // Players you can hit right now come first.
  const targets = (board.data ?? [])
    .filter((m) => me.data && m.user.id !== me.data.id)
    .map((m) => ({ ...m, cooldownUntil: m.cooldownUntil && Date.parse(m.cooldownUntil) > now ? m.cooldownUntil : null }))
    .sort((a, b) => Number(Boolean(a.cooldownUntil)) - Number(Boolean(b.cooldownUntil)))
  const target = targets.find((m) => m.user.id === targetId)
  // Shooter cooldown: after a snipe you have to wait before the next one.
  const myRow = board.data?.find((m) => me.data && m.user.id === me.data.id)
  const reloadUntil =
    myRow?.shooterCooldownUntil && Date.parse(myRow.shooterCooldownUntil) > now ? myRow.shooterCooldownUntil : null

  const missed = typeof check === 'object' && check !== null && !check.hit
  const canSend = check !== 'checking' && !missed

  const canShoot =
    cameraReady && Boolean(league) && !board.loading && !board.error && Boolean(me.data) && !shot && !reloadUntil

  // Fetch the person-detection model while the player is still aiming.
  useEffect(() => { personCheck().then((m) => m.preloadPersonCheck()).catch(() => {}) }, [])

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
      setShot(taken)
      setCheck('checking')
      checking.current = taken
      personCheck().then((m) => m.checkPerson(taken.photo)).then(
        (result) => { if (checking.current === taken) setCheck(result) },
        // If the check can't run (e.g. the model can't download), don't block a real hit.
        () => { if (checking.current === taken) setCheck('failed') },
      )
      setRequestId(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture photo.')
    } finally { capturing.current = false }
  }

  async function confirm() {
    if (!league || !target || !shot || submitting || !canSend) return
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
    setCheck(null)
    checking.current = null
    setRequestId(null)
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
      {shot && <ShotReview shot={shot} check={check} />}
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
            <h2>{missed ? 'Missed!' : 'Who did you get?'}</h2>
            <button className="button" onClick={backToStart}>
              Back to start
            </button>
          </div>
          {missed && <p className="muted">Nobody was in your crosshair, so this shot can't be sent. Go back and try again.</p>}
          {check === 'failed' && <p className="muted small">Couldn't check this shot automatically, so it's up to you.</p>}
          {!missed && <>
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
                  {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} />}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="error">{error}</p>}
          <button
            className="button button-primary button-block button-large"
            disabled={!target || submitting || !canSend}
            onClick={confirm}
          >
            {submitting ? 'Sending…' : check === 'checking' ? 'Checking your shot…' : target ? `Send: snipe ${target.user.displayName}` : 'Tap who you got'}
          </button>
          </>}
        </div>
      )}

      {done && league && (
        <div className="snipe-success">
          {/* A headshot gets its own photo, faded, behind the celebration. */}
          {shot && typeof check === 'object' && check?.headshot && (
            <img className="success-backdrop" src={shot.photo} alt="" aria-hidden />
          )}
          <div className="success-icon">
            <CrosshairIcon width={56} height={56} />
          </div>
          <h1>{typeof check === 'object' && check?.headshot ? 'Headshot!' : 'Sniped!'}</h1>
          <p>
            <strong>{done.member.user.displayName}</strong> · +{done.points} points
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