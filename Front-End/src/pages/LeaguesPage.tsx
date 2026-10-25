import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createLeague, getMyLeagues, joinLeague } from '../api'
import { PageHeader } from '../components/PageHeader'
import { RulesFields } from '../components/RulesFields'
import { DEFAULT_RULES } from '../rules'
import { useAsync } from '../hooks'

type Panel = 'none' | 'join' | 'create'

export function LeaguesPage() {
  const { data: leagues, loading, error } = useAsync(getMyLeagues, [])
  const [panel, setPanel] = useState<Panel>('none')

  return (
    <>
      <PageHeader title="Your leagues" />

      <div className="button-row">
        <button
          className={panel === 'join' ? 'button button-primary' : 'button'}
          onClick={() => setPanel(panel === 'join' ? 'none' : 'join')}
        >
          Join with code
        </button>
        <button
          className={panel === 'create' ? 'button button-primary' : 'button'}
          onClick={() => setPanel(panel === 'create' ? 'none' : 'create')}
        >
          Create league
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

      <ul className="list">
        {leagues?.map((league) => (
          <li key={league.id}>
            <Link to={`/leagues/${league.id}`} className="card card-link">
              <div>
                <h2 className="card-title">{league.name}</h2>
                <p className="muted small">
                  {league.memberIds.length} players · {league.cooldownMinutes} min cooldown
                </p>
              </div>
              <span className="code">{league.joinCode}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
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
