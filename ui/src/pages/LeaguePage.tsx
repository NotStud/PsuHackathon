import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getFeed, getLeaderboard, getLeague } from '../api'
import { getCurrentUser } from '../api'
import { Avatar } from '../components/Avatar'
import { CooldownBadge } from '../components/CooldownBadge'
import { CrosshairIcon } from '../components/Icons'
import { PageHeader } from '../components/PageHeader'
import { timeAgo } from '../format'
import { useAsync } from '../hooks'
import type { Member, Snipe } from '../types'

type Tab = 'leaderboard' | 'feed'

export function LeaguePage() {
  const { leagueId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const me = useAsync(getCurrentUser, [])
  const league = useAsync(() => getLeague(leagueId), [leagueId])
  const board = useAsync(() => getLeaderboard(leagueId), [leagueId])
  const feed = useAsync(() => getFeed(leagueId), [leagueId])

  if (league.error) return <p className="error">{league.error}</p>

  return (
    <>
      <PageHeader title={league.data?.name ?? 'League'} back />

      {league.data && (
        <p className="muted small league-meta">
          Code <span className="code">{league.data.joinCode}</span> ·{' '}
          {league.data.pointsPerSnipe} pts per snipe · {league.data.cooldownMinutes} min cooldown
        </p>
      )}

      <Link to={`/snipe?league=${leagueId}`} className="button button-primary button-block">
        <CrosshairIcon width={20} height={20} />
        Snipe someone
      </Link>

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
        <Leaderboard members={board.data} loading={board.loading} currentUserId={me.data?.id} />
      ) : (
        <Feed snipes={feed.data} members={board.data} loading={feed.loading} />
      )}
    </>
  )
}

function Leaderboard({ members, loading, currentUserId }: { members: Member[] | null; loading: boolean; currentUserId?: string }) {
  if (loading && !members) return <p className="muted">Loading…</p>
  return (
    <ol className="list">
      {members?.map((m, i) => (
        <li key={m.user.id} className={m.user.id === currentUserId ? 'row row-me' : 'row'}>
          <span className="rank">{i + 1}</span>
          <Avatar user={m.user} />
          <div className="row-main">
            <span className="row-name">{m.user.displayName}</span>
            <span className="muted small">
              {m.snipes} snipes · sniped {m.timesSniped}×
            </span>
          </div>
          {m.cooldownUntil && <CooldownBadge until={m.cooldownUntil} />}
          <span className="points">{m.points}</span>
        </li>
      ))}
    </ol>
  )
}

function Feed({
  snipes,
  members,
  loading,
}: {
  snipes: Snipe[] | null
  members: Member[] | null
  loading: boolean
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
          <li key={s.id} className="card feed-item">
            <Avatar user={sniper} size={32} />
            <p>
              <strong>{sniper.displayName}</strong> sniped <strong>{target.displayName}</strong>
              <span className="muted small"> · {timeAgo(s.createdAt)}</span>
            </p>
            {s.photoUrl && <img className="feed-photo" src={s.photoUrl} alt="Snipe proof" />}
          </li>
        )
      })}
    </ul>
  )
}
