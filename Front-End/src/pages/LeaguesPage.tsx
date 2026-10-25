import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createLeague, getMyLeagues, joinLeague } from '../api'
import { ChevronRightIcon, ClockIcon, PlayersIcon, PlusIcon } from '../components/Icons'
import { RulesFields } from '../components/RulesFields'
import { DEFAULT_RULES } from '../rules'
import { useAsync } from '../hooks'

type Panel = 'none' | 'join' | 'create'

export function LeaguesPage() {
  const { data: leagues, loading, error } = useAsync(getMyLeagues, [])
  const [panel, setPanel] = useState<Panel>('none')

  return (
    <div className="leagues-page">
      <header className="leagues-heading">
        <div className="heading-line"><h1>Your leagues</h1>
          {leagues && <span className="active-count">{leagues.length} Active</span>}
        </div>
        <p>Live assassin targets &amp; real-time cooldown trackers</p>
      </header>

      <div className="button-row league-actions">
        <button
          className={panel === 'join' ? 'button button-primary' : 'button'}
          onClick={() => setPanel(panel === 'join' ? 'none' : 'join')}
        >
          <span className="hash-icon" aria-hidden>#</span> Join with code
        </button>
        <button
          className="button button-primary"
          onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}
        >
          <PlusIcon width={20} height={20} /> Create league
        </button>
      </div>

      {panel === 'join' && <JoinForm />}
      {panel === 'create' && <CreateForm />}

      {loading && <p className="muted">Loading leagues…</p>}
      {error && <p className="error">{error}</p>}
      {leagues?.length === 0 && (
        <div className="empty">
          <p>You're not in any leagues yet.</p>
          <p className="muted">Join one with a code from a friend, or start your own.</p>
        </div>
      )}

      <ul className="list league-cards">
        {leagues?.map((league) => (
          <li key={league.id}>
            <Link to={`/leagues/${league.id}`} className="league-card">
              <div className="league-card-main">
                <h2><span className="league-status-dot" aria-hidden />{league.name}</h2>
                <div className="league-card-meta">
                  <span><PlayersIcon />{league.memberIds.length} players</span>
                  <span className="meta-divider" aria-hidden>·</span>
                  <span><ClockIcon />{league.cooldownMinutes} min cooldown</span>
                </div>
              </div>
              <ChevronRightIcon className="league-chevron" width={18} height={18} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function JoinForm() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const league = await joinLeague(code)
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <label className="field">
        <span>League code</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. HACK26"
          maxLength={8}
          autoCapitalize="characters"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="button button-primary" disabled={busy || !code.trim()}>
        {busy ? 'Joining…' : 'Join league'}
      </button>
    </form>
  )
}

function CreateForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [rules, setRules] = useState(DEFAULT_RULES)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const league = await createLeague(name, rules)
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <label className="field">
        <span>League name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Dorm 4B"
          maxLength={40}
          required
        />
      </label>
      <h3 className="form-section">Game rules</h3>
      <p className="muted small">You can change these later from the league page.</p>
      <RulesFields rules={rules} onChange={setRules} />
      {error && <p className="error">{error}</p>}
      <button className="button button-primary" disabled={busy || !name.trim()}>
        {busy ? 'Creating…' : 'Create league'}
      </button>
    </form>
  )
}
