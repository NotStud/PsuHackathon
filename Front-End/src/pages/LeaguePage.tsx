import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { approveChallenge, challengeSnipe, getFeed, getLeaderboard, getLeague, updateLeagueRules } from '../api'
import { getCurrentUser } from '../api'
import { Avatar } from '../components/Avatar'
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
import type { League, Member, Snipe } from '../types'

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
        <Leaderboard members={board.data} loading={board.loading} currentUserId={me.data?.id} league={league.data} />
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
    </>
  )
}

function LeagueRulesLine({ league }: { league: League }) {
  const parts = [
    `${league.pointsPerSnipe} pts per snipe`,
    league.bountyBonusPoints > 0 && `bounty +${league.bountyBonusPoints}`,
    league.kingBonusPoints > 0 && `king +${league.kingBonusPoints}`,
    `${league.cooldownMinutes} min immunity`,
    league.shooterCooldownMinutes > 0 && `${league.shooterCooldownMinutes} min sniper cooldown`,
    `bounty switches every ${league.bountyHours}h`,
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
}: {
  members: Member[] | null
  loading: boolean
  currentUserId?: string
  league: League | null
}) {
  if (loading && !members) return <p className="muted">Loading…</p>
  return (
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
        </li>
      ))}
    </ol>
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
        return (
          <li key={s.id} className={s.status === 'reversed' ? 'card feed-item reversed' : 'card feed-item'}>
            <Avatar user={sniper} size={32} />
            <p>
              <strong>{sniper.displayName}</strong> sniped <strong>{target.displayName}</strong>
              <span className="muted small"> · {timeAgo(s.createdAt)}</span>
            </p>
            <span className="snipe-points">{s.status === 'reversed' ? 'Reversed' : `+${s.points}`}</span>
            {s.photoUrl && <SnipePhoto src={s.photoUrl} crosshair={s.crosshair} />}
            <ChallengeControls leagueId={leagueId} snipe={s} currentUserId={currentUserId} onChange={onChange} />
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
      <img className="feed-photo" src={src} alt="Snipe proof" />
      {style && color && (
        <span className="feed-crosshair" aria-hidden>
          <Crosshair size={48} style={style} color={color} />
        </span>
      )}
    </div>
  )
}

/**
 * The player who was hit can challenge a snipe; anyone else in the league (not the
 * shooter or the target) can then approve the challenge, which reverses the snipe.
 */
function ChallengeControls({
  leagueId,
  snipe,
  currentUserId,
  onChange,
}: {
  leagueId: string
  snipe: Snipe
  currentUserId?: string
  onChange: () => void
}) {
  const [writing, setWriting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTarget = currentUserId === snipe.targetId
  const isReviewer = Boolean(currentUserId) && !isTarget && currentUserId !== snipe.sniperId

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setWriting(false)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function submitChallenge(e: FormEvent) {
    e.preventDefault()
    void run(() => challengeSnipe(leagueId, snipe.id, reason.trim()))
  }

  return (
    <div className="feed-challenge">
      {snipe.status === 'challenged' && (
        <p className="small">
          <span className="badge badge-challenged">Challenged</span> “{snipe.challengeReason}”
        </p>
      )}
      {snipe.status === 'reversed' && snipe.challengeReason && (
        <p className="muted small">Reversed after challenge: “{snipe.challengeReason}”</p>
      )}

      {snipe.status === 'valid' && isTarget && !writing && (
        <button className="link-button small" onClick={() => setWriting(true)}>
          Challenge this snipe
        </button>
      )}
      {writing && (
        <form className="challenge-form" onSubmit={submitChallenge}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why doesn't it count?"
            maxLength={500}
            required
            autoFocus
          />
          <button className="button button-primary" disabled={busy || !reason.trim()}>
            {busy ? 'Sending…' : 'Challenge'}
          </button>
          <button type="button" className="button" onClick={() => setWriting(false)}>
            Cancel
          </button>
        </form>
      )}
      {snipe.status === 'challenged' && isReviewer && (
        <button className="button" disabled={busy} onClick={() => void run(() => approveChallenge(leagueId, snipe.id))}>
          {busy ? 'Approving…' : 'Approve challenge (reverse snipe)'}
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
