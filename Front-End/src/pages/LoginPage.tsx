import { useState, type FormEvent } from 'react'
import { signIn } from '../api'
import { CrosshairIcon } from '../components/Icons'

// Joining creates a player; the browser remembers its private session token.
export function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await signIn(email)
      window.location.assign('/snipe')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <span className="login-logo">
          <CrosshairIcon width={48} height={48} />
        </span>
        <h1>Snipe</h1>
        <p className="muted">Spot your friends in the wild. Snap them. Climb the board.</p>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Display name</span>
          <input
            type="text"
            maxLength={80}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your name"
            autoComplete="nickname"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button disabled={busy} className="button button-primary button-block button-large">{busy ? "Joining…" : "Continue"}</button>
      </form>
    </div>
  )
}
