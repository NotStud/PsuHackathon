import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  challengeSnipe, deleteLeague, getFeed, getLeaderboard, getLeague, leaveLeague, removeMember, updateLeagueRules,
  voteOnChallenge,
} from '../api'
import { getCurrentUser } from '../api'
import { Avatar } from '../components/Avatar'
import { SnipeImage } from '../components/SnipeImage'
import { rimFor } from '../rims'
import { CooldownBadge } from '../components/CooldownBadge'
import { Crosshair } from '../components/Crosshair'
import { TargetIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { RuleBadges } from '../components/RuleBadges'
import { RulesFields } from '../components/RulesFields'
import type { Rules } from '../rules'
import { timeAgo, timeUntil } from '../format'
import { useAsync, useNow } from '../hooks'
import type { Challenge, League, Member, Snipe, User } from '../types'

type Tab = 'leaderboard' | 'feed'

export function LeaguePage() {
  const { leagueId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const me = useAsync(getCurrentUser, [])
  const league = useAsync(() => getLeague(leagueId), [leagueId])
  const board = useAsync(() => getLeaderboard(leagueId), [leagueId])
  const feed = useAsync(() => getFeed(leagueId), [leagueId])

  // Challenges and reversals change points, timers and the feed.
  function refresh() {
    board.reload()
    feed.reload()
  }
  // While a challenge is being voted on, keep the votes and points current as others vote.
  const voting = feed.data?.some((s) => s.challenges.some((c) => c.status === 'pending')) ?? false
  const { reload: reloadBoard } = board
  const { reload: reloadFeed } = feed
  useEffect(() => {
    if (!voting) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') { reloadBoard(); reloadFeed() }
    }, 5000)
    return () => clearInterval(id)
  }, [voting, reloadBoard, reloadFeed])

  if (league.error) return <p className="error">{league.error}</p>

  return (
    <>
      <PageHeader title={league.data?.name ?? 'League'} back />

      {league.data && <LeagueRulesLine league={league.data} />}
      {league.data && me.data?.id === league.data.creatorId && (
        <RulesEditor league={league.data} onSaved={() => { league.reload(); board.reload() }} />
      )}
      {league.data && <BountyBanner league={league.data} members={board.data} />}

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'leaderboard'} onClick={() => setTab('leaderboard')}>
          Leaderboard
        </button>
        <button role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')}>
          Recent snipes
        </button>
      </div>

      {(board.error || feed.error) && <p className="error">{board.error || feed.error}</p>}
      {tab === 'leaderboard' ? (
        <Leaderboard members={board.data} loading={board.loading} currentUserId={me.data?.id} league={league.data}
          onRemoved={() => { league.reload(); refresh() }} />
      ) : (
        <Feed
          leagueId={leagueId}
          snipes={feed.data}
          members={board.data}
          loading={feed.loading}
          currentUserId={me.data?.id}
          onChange={refresh}
        />
      )}

      {league.data && me.data && (
        <LeaveOrDelete league={league.data} isCreator={me.data.id === league.data.creatorId} />
      )}
    </>
  )
}

/**
 * At the bottom of the league: anyone but the creator can leave; the creator can delete the
 * league for everyone. Both ask first.
 */
function LeaveOrDelete({ league, isCreator }: { league: League; isCreator: boolean }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await (isCreator ? deleteLeague(league.id) : leaveLeague(league.id))
      navigate('/leagues', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="league-exit">
      {!confirming ? (
        <button className="button button-danger-outline button-block" onClick={() => setConfirming(true)}>
          {isCreator ? 'Delete league' : 'Leave league'}
        </button>
      ) : (
        <div className="exit-confirm" role="alertdialog" aria-label={isCreator ? 'Delete league?' : 'Leave league?'}>
          <p>
            {isCreator ? <>
              <strong>Delete {league.name}?</strong> The league, its leaderboard and all its snipes are deleted for
              everyone. This can't be undone.
            </> : <>
              <strong>Leave {league.name}?</strong> You'll be taken off the leaderboard. You can rejoin later with
              the code <span className="code">{league.joinCode}</span>.
            </>}
          </p>
          <div className="button-row">
            <button className="button button-danger" disabled={busy} onClick={() => void confirm()}>
              {busy ? (isCreator ? 'Deleting…' : 'Leaving…') : isCreator ? 'Delete league' : 'Leave league'}
            </button>
            <button className="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

function LeagueRulesLine({ league }: { league: League }) {
  const parts = [
    `${league.pointsPerSnipe} pts per snipe`,
    league.bountyBonusPoints > 0 && `bounty +${league.bountyBonusPoints}`,
    league.kingBonusPoints > 0 && `king +${league.kingBonusPoints}`,
    league.headshotBonusPoints > 0 && `headshot +${league.headshotBonusPoints}`,
    `${league.cooldownMinutes} min immunity`,
    league.shooterCooldownMinutes > 0 && `${league.shooterCooldownMinutes} min sniper cooldown`,
    `bounty switches every ${league.bountyHours}h`,
    `challenges pass at ${league.challengeVotes} yes vote${league.challengeVotes === 1 ? '' : 's'}`,
  ].filter(Boolean)
  return (
    <p className="muted small league-meta">
      Code <span className="code">{league.joinCode}</span> · {parts.join(' · ')}
    </p>
  )
}

/** The league creator can change any rule; changes apply to snipes from now on. */
function RulesEditor({ league, onSaved }: { league: League; onSaved: () => void }) {
  const current: Rules = {
    cooldownMinutes: league.cooldownMinutes,
    shooterCooldownMinutes: league.shooterCooldownMinutes,
    pointsPerSnipe: league.pointsPerSnipe,
    bountyBonusPoints: league.bountyBonusPoints,
    kingBonusPoints: league.kingBonusPoints,
    bountyHours: league.bountyHours,
    headshotBonusPoints: league.headshotBonusPoints,
    challengeVotes: league.challengeVotes,
  }
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState(current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await updateLeagueRules(league.id, rules)
      setOpen(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="link-button rules-edit" onClick={() => { setRules(current); setOpen(true) }}>
        Edit game rules
      </button>
    )
  }
  return (
    <form className="card form" onSubmit={save}>
      <h3 className="form-section">Game rules</h3>
      <RulesFields rules={rules} onChange={setRules} />
      {error && <p className="error">{error}</p>}
      <div className="button-row">
        <button type="button" className="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="button button-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save rules'}
        </button>
      </div>
    </form>
  )
}

function BountyBanner({ league, members }: { league: League; members: Member[] | null }) {
  const now = useNow(30_000)
  const bounty = members?.find((m) => m.user.id === league.bountyPlayerId)
  if (!bounty) return null
  return (
    <div className="bounty-banner">
      <TargetIcon width={22} height={22} />
      <p>
        <strong>{bounty.user.displayName}</strong> is the bounty
        {league.bountyBonusPoints > 0 && <> · +{league.bountyBonusPoints} pts</>}
        {league.bountyEndsAt && <span className="muted small"> · moves in {timeUntil(league.bountyEndsAt, now)}</span>}
      </p>
    </div>
  )
}

function Leaderboard({
  members,
  loading,
  currentUserId,
  league,
  onRemoved,
}: {
  members: Member[] | null
  loading: boolean
  currentUserId?: string
  league: League | null
  onRemoved: () => void
}) {
  // The league's creator can remove other players, after confirming.
  const isCreator = Boolean(league && currentUserId && league.creatorId === currentUserId)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove(userId: string) {
    if (!league) return
    setRemoving(true)
    setError(null)
    try {
      await removeMember(league.id, userId)
      setConfirming(null)
      onRemoved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(false)
    }
  }

  if (loading && !members) return <p className="muted">Loading…</p>
  return (
    <>
    {error && <p className="error small">{error}</p>}
    <ol className="list">
      {members?.map((m, i) => (
        <li key={m.user.id} className={m.user.id === currentUserId ? 'row row-me' : 'row'}>
          <span className="rank">{i + 1}</span>
          <Avatar user={m.user} rim={rimFor(m, members)} />
          <div className="row-main">
            <span className="row-name">{m.user.displayName}</span>
            <span className="muted small">
              {m.snipes} snipes · sniped {m.timesSniped}×
            </span>
            <span className="row-badges">
              <RuleBadges member={m} league={league} members={members} />
              {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} />}
              {m.shooterCooldownUntil && <CooldownBadge until={m.shooterCooldownUntil} kind="reloading" />}
            </span>
          </div>
          <span className="points">{m.points}</span>
          {isCreator && m.user.id !== currentUserId && confirming !== m.user.id && (
            <button className="link-button small row-remove" onClick={() => setConfirming(m.user.id)}>
              Remove
            </button>
          )}
          {confirming === m.user.id && (
            <div className="remove-confirm">
              <span className="small">Remove {m.user.displayName} from the league?</span>
              <button className="button button-danger" disabled={removing} onClick={() => void remove(m.user.id)}>
                {removing ? 'Removing…' : 'Remove'}
              </button>
              <button className="button" disabled={removing} onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          )}
        </li>
      ))}
    </ol>
    </>
  )
}

function Feed({
  leagueId,
  snipes,
  members,
  loading,
  currentUserId,
  onChange,
}: {
  leagueId: string
  snipes: Snipe[] | null
  members: Member[] | null
  loading: boolean
  currentUserId?: string
  onChange: () => void
}) {
  if (loading && !snipes) return <p className="muted">Loading…</p>
  if (snipes?.length === 0) return <p className="empty muted">No snipes yet. Be the first.</p>

  const userById = new Map(members?.map((m) => [m.user.id, m.user]))
  return (
    <ul className="list">
      {snipes?.map((s) => {
        const sniper = userById.get(s.sniperId)
        const target = userById.get(s.targetId)
        if (!sniper || !target) return null
        // A miss only counts once the league votes it a hit.
        const uncountedMiss = s.missed && !s.challenges.some((c) => c.kind === 'hit' && c.status === 'approved')
        return (
          <li key={s.id} className={s.status === 'reversed' ? 'card feed-item reversed' : 'card feed-item'}>
            <Avatar user={sniper} size={32} />
            <p>
              <strong>{sniper.displayName}</strong> {uncountedMiss ? 'shot at' : 'sniped'} <strong>{target.displayName}</strong>
              <span className="muted small"> · {timeAgo(s.createdAt)}</span>
            </p>
            <span className="snipe-points">
              {s.headshot && s.status !== 'reversed' && <span className="badge badge-headshot">Headshot</span>}
              {s.status === 'reversed' ? 'Reversed' : uncountedMiss ? 'Miss' : `+${s.points}`}
            </span>
            {s.photoUrl && <SnipePhoto src={s.photoUrl} crosshair={s.crosshair} />}
            <ChallengeControls leagueId={leagueId} snipe={s} userById={userById} currentUserId={currentUserId}
              onChange={onChange} />
          </li>
        )
      })}
    </ul>
  )
}

/** The hit photo with the crosshair the shooter had on, at the aim point (the photo's center). */
function SnipePhoto({ src, crosshair }: { src: string; crosshair?: string | null }) {
  const [style, color] = crosshair?.split(':') ?? []
  return (
    <div className="feed-shot">
      <SnipeImage src={src} />
      {style && color && (
        <span className="feed-crosshair" aria-hidden>
          <Crosshair size={48} style={style} color={color} />
        </span>
      )}
    </div>
  )
}

/**
 * Challenges on a snipe and the league's votes on them. The player who was hit can
 * challenge to have it reversed; the shooter can claim it was a headshot. Everyone else
 * can vote yes (there is no no vote): at the league's yes-vote count the challenge passes,
 * and until then the snipe stands.
 */
function ChallengeControls({
  leagueId,
  snipe,
  userById,
  currentUserId,
  onChange,
}: {
  leagueId: string
  snipe: Snipe
  userById: Map<string, User>
  currentUserId?: string
  onChange: () => void
}) {
  // The challenge form: the target ticks no hit and/or no headshot; the shooter claims a headshot.
  const [open, setOpen] = useState(false)
  const [noHit, setNoHit] = useState(false)
  const [noHeadshot, setNoHeadshot] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTarget = currentUserId === snipe.targetId
  const isShooter = currentUserId === snipe.sniperId
  const isVoter = Boolean(currentUserId) && !isTarget && !isShooter
  const has = (kind: Challenge['kind']) => snipe.challenges.some((c) => c.kind === kind)
  // An uncounted miss can only be voted a hit; once it counts it can be challenged like any hit.
  const counts = !snipe.missed || snipe.challenges.some((c) => c.kind === 'hit' && c.status === 'approved')
  const live = counts && snipe.status !== 'reversed'
  const canSayNoHit = live && isTarget && !has('reverse')
  const canSayNoHeadshot = live && isTarget && snipe.headshot && !has('no-headshot')
  const canClaimHeadshot = live && isShooter && !snipe.headshot && !has('headshot') && !has('no-headshot')
    && !snipe.challenges.some((c) => c.kind === 'hit' && c.claimsHeadshot)  // the miss claim already says headshot
  // "No hit" covers "no headshot" too.
  const kind: Challenge['kind'] | null = isShooter ? 'headshot' : noHit ? 'reverse' : noHeadshot ? 'no-headshot' : null

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setOpen(false)
      setNoHit(false)
      setNoHeadshot(false)
      setReason('')
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function submitChallenge(e: FormEvent) {
    e.preventDefault()
    if (kind) void run(() => challengeSnipe(leagueId, snipe.id, kind, reason.trim()))
  }

  return (
    <div className="feed-challenge">
      {snipe.challenges.map((c) => (
        <div key={c.id} className={`challenge challenge-${c.status}`}>
          <p className="small">
            <strong>{userById.get(c.challengerId)?.displayName ?? 'Someone'}</strong>
            {c.kind === 'reverse' ? ' says it was no hit'
              : c.kind === 'no-headshot' ? ' says it was no headshot'
              : c.kind === 'headshot' ? ' says it was a headshot'
              : c.claimsHeadshot ? ' says this miss was a headshot' : ' says this miss was a hit'}
            {c.reason ? `: “${c.reason}”` : ''}
          </p>
          <p className="muted small">
            {c.status === 'pending' && <>
              <span className="badge badge-challenged">Voting</span>{' '}
              {c.yesVotes} of {c.votesNeeded} yes vote{c.votesNeeded === 1 ? '' : 's'} · the snipe stands until then
            </>}
            {c.status === 'approved' && (c.kind === 'reverse' ? 'Passed: snipe reversed and points given back.'
              : c.kind === 'no-headshot' ? 'Passed: not a headshot, bonus taken away (the hit still counts).'
              : c.kind === 'headshot' ? 'Passed: counted as a headshot, bonus added.'
              : c.claimsHeadshot ? 'Passed: counted as a headshot hit, points and bonus added.'
              : 'Passed: counted as a hit, points added.')}
            {c.status === 'rejected' && 'Voted down: the snipe stands as it was.'}
          </p>
          {c.voterIds.length > 0 && (
            <p className="small challenge-voters">
              Voted yes: {c.voterIds.map((id) => userById.get(id)?.displayName ?? 'Someone').join(', ')}
            </p>
          )}
          {c.status === 'pending' && isVoter && (
            <div className="vote-buttons">
              {c.voted ? (
                <span className="muted small">You voted yes.</span>
              ) : (
                <button className="button button-primary" disabled={busy}
                  onClick={() => void run(() => voteOnChallenge(leagueId, c.id))}>
                  {busy ? 'Voting…' : c.kind === 'reverse' ? 'Yes, no hit'
                    : c.kind === 'no-headshot' ? 'Yes, no headshot'
                    : c.claimsHeadshot ? 'Yes, it was a headshot' : 'Yes, it was a hit'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {!open && (canSayNoHit || canSayNoHeadshot || canClaimHeadshot) && (
        <button className="link-button small" onClick={() => setOpen(true)}>
          {isShooter ? 'Challenge: it was a headshot' : 'Challenge this snipe'}
        </button>
      )}
      {open && (
        <form className="challenge-form" onSubmit={submitChallenge}>
          {isShooter ? (
            <label className="claim-check">
              <input type="checkbox" checked readOnly /> It was a headshot
            </label>
          ) : <>
            {canSayNoHit && (
              <label className="claim-check">
                <input type="checkbox" checked={noHit} onChange={(e) => setNoHit(e.target.checked)} /> No hit
              </label>
            )}
            {canSayNoHeadshot && (
              <label className="claim-check">
                <input type="checkbox" checked={noHit || noHeadshot} disabled={noHit}
                  onChange={(e) => setNoHeadshot(e.target.checked)} /> No headshot (the hit still counts)
              </label>
            )}
          </>}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add a message (optional)"
            maxLength={500}
            aria-label="Message (optional)"
          />
          <button className="button button-primary" disabled={busy || !kind}>
            {busy ? 'Sending…' : 'Challenge'}
          </button>
          <button type="button" className="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
