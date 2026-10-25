import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fireShot, getLeaderboard, getMyLeagues, submitSnipe } from '../api'
import { getCurrentUser } from '../api'
import { MotionTrigger } from '../camera/MotionTrigger'
import { CameraView, type CameraHandle, type Shot } from '../camera/CameraView'
import { ShotReview } from '../camera/KillCam'
import { KillCamActions } from '../camera/KillCamActions'
import { bang, playHit, playReload } from '../camera/feedback'
import type { PersonCheck } from '../camera/personCheck'
import type { FireInfo } from '../../../trigger_camera/trigger.js'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { RuleBadges } from '../components/RuleBadges'
import { CloseIcon, CrosshairIcon } from '../components/Icons'
import { Crosshair } from '../components/Crosshair'
import { useCrosshair } from '../crosshairs'
import { countdown } from '../format'
import { useAsync, useNow } from '../hooks'
import type { Member } from '../types'

// The person-detection library is big, so only pages that shoot load it.
const personCheck = () => import('../camera/personCheck')

/**
 * Full-screen, camera-first snipe flow, opened only from the red button in the tab bar.
 * The player first picks the league they're sniping in (so the shot uses that league's
 * reload time), while the camera warms up behind. One Start tap arms the flick trigger
 * (and starts recording), a flick takes the shot, and choosing *who* you hit happens
 * after, over the kill cam and hit photo.
 */
export function SnipePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const cameraRef = useRef<CameraHandle>(null)
  const capturing = useRef(false)
  const [cameraReady, setCameraReady] = useState(false)

  const [crosshair] = useCrosshair()
  const me = useAsync(getCurrentUser, [])
  const leagues = useAsync(getMyLeagues, [])
  // Nothing is preselected: the player picks the league each time they open the camera.
  const league = leagues.data?.find((l) => l.id === params.get('league'))
  // For the league picker: when this player can shoot again in each league (null = ready).
  const reloads = useAsync(async () => {
    if (league) return {}
    const [user, list] = await Promise.all([getCurrentUser(), getMyLeagues()])
    const rows = await Promise.all(list.map((l) => getLeaderboard(l.id)))
    return Object.fromEntries(
      list.map((l, i) => [l.id, rows[i].find((m) => m.user.id === user.id)?.shooterCooldownUntil ?? null]),
    ) as Record<string, string | null>
  }, [league?.id])
  const board = useAsync(
    () => (league ? getLeaderboard(league.id) : Promise.resolve([])),
    [league?.id],
  )

  const [started, setStarted] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
  // Was the crosshair on a person? Worked out on the device right after the shot.
  const [check, setCheck] = useState<PersonCheck | 'checking' | 'failed' | null>(null)
  const checking = useRef<Shot | null>(null)
  // The "shot fired" request; a hit is only sent after it, so the server sees them in order.
  const registering = useRef<Promise<unknown> | null>(null)
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
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const at = Date.now()
    // Every shot fired starts the league's sniper cooldown, hit or miss, even if the photo
    // fails or the network is slow. The server's time replaces this guess once it answers.
    if (league) {
      setShotReload(new Date(at + league.shooterCooldownMinutes * 60_000).toISOString())
      registering.current = fireShot(league.id, id).then(
        (shotFired) => setShotReload(shotFired.reloadUntil),
        (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
      )
    }
    try {
      const taken = await cameraRef.current?.takeShot(fired)
      if (!taken) throw new Error('Camera is not ready. Try again.')
      setShot(taken)
      setRequestId(id)
      setFiredAt(at)

      setCheck('checking')
      checking.current = taken
      personCheck().then((m) => m.checkPerson(taken.photo)).then(
        (result) => { if (checking.current === taken) setCheck(result) },
        // If the check can't run (e.g. the model can't download), don't block a real hit.
        () => { if (checking.current === taken) setCheck('failed') },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to capture photo.')
    } finally { capturing.current = false }
  }

  async function confirm() {
    if (!league || !target || !shot || submitting || !canSend) return
    setSubmitting(true)
    setError(null)
    try {
      await registering.current
      const snipe = await submitSnipe(
        league.id, target.user.id, shot.photo, requestId ?? undefined, `${crosshair.style}:${crosshair.color}`,
      )
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

  // Only before shooting: a shot always belongs to the league it was fired in.
  function chooseLeague(id: string | null) {
    setParams(id ? { league: id } : {}, { replace: true })
    setTargetId(null)
    setError(null)
    setStarted(false)
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
        {league && (
          <span className="snipe-league-chip">
            {league.name}
            {!shot && (
              <button className="link-button" onClick={() => chooseLeague(null)}>
                Change
              </button>
            )}
          </span>
        )}
      </div>

      {/* Step 1: which league this shot is for. */}
      {!league && leagues.data && leagues.data.length > 0 && (
        <div className="sheet" role="dialog" aria-label="Which league?">
          <div className="sheet-header">
            <h2>Which league are you sniping in?</h2>
          </div>
          <p className="muted small">Your shot counts in that league and uses its reload time.</p>
          <ul className="league-picker">
            {leagues.data.map((l) => {
              const until = reloads.data?.[l.id]
              return (
                <li key={l.id}>
                  <button className="league-choice" onClick={() => chooseLeague(l.id)}>
                    <span>
                      {l.name}
                      <span className="muted small league-choice-meta">
                        {l.memberIds.length} players · {l.shooterCooldownMinutes} min reload
                      </span>
                    </span>
                    {until && Date.parse(until) > now ? (
                      <CooldownBadge until={until} kind="reloading" />
                    ) : (
                      <span className="badge badge-ready">{reloads.loading ? '…' : 'Ready'}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {reloads.error && <p className="error small">{reloads.error}</p>}
        </div>
      )}

      {/* Step 2: the camera, armed for that league. */}
      {!shot && (league || leagues.data?.length === 0) && (
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
          <p className="muted small">Immunity timers are paused at the moment you fired.</p>
          {shot.clip && <KillCamActions clip={shot.clip} shotAt={shot.shotAt} />}
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
                  {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} frozenAt={firedAt ?? undefined} />}
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
          <div className="success-icon">
            <CrosshairIcon width={56} height={56} />
          </div>
          <h1>{typeof check === 'object' && check?.headshot ? 'Headshot!' : 'Sniped!'}</h1>
          <p>
            <strong>{done.member.user.displayName}</strong> · +{done.points} points
          </p>
          <p className="small">They're safe for the next {league.cooldownMinutes} minutes.</p>
          {shot?.clip && <KillCamActions clip={shot.clip} shotAt={shot.shotAt} />}
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